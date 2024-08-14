import 'dotenv/config';

import { OpenAI } from "openai";
import xlsx from 'xlsx';
import cors from 'cors';
import multer from 'multer';
import express from "express";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { Pinecone } from '@pinecone-database/pinecone';
import XLSX from 'xlsx';
import archiver from 'archiver';
import { Readable } from 'stream';
import fs from 'fs';

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

app.use(cors());
const upload = multer({ dest: 'uploads/' });
//RAG
let total_tokens = 0;
app.post("/rag", upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet)

        const index = pinecone.Index('matchai');
        // Generate and store embeddings
        const batchSize = 100;
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const upsertRequests = await Promise.all(batch.map(async (client) => {
                const fullProfile = `${client.company} ${client.title} ${client.expertise} ${client.i_refer} ${client.i_have}`;
                const [profileEmbedding, wantEmbedding] = await Promise.all([
                    getEmbedding(fullProfile),
                    getEmbedding(client.i_want)
                ]);
                return [
                    { id: `${client.member_no}_profile`, values: profileEmbedding },
                    { id: `${client.member_no}_want`, values: wantEmbedding }
                ];
            }));
            console.log("upsertRequests: ", upsertRequests)
            await index.upsert(upsertRequests.flat());
        }

        // Find matches and generate descriptions
        const allMatches = [];

        for (const client of data) {
            const wantEmbedding = await getEmbedding(client.i_want);
            const queryResponse = await index.query({
                vector: wantEmbedding,
                topK: 10,
                filter: { id: { $ne: `${client.member_no}_want` } }
            });

            const clientMatches = await Promise.all(queryResponse.matches
                .filter(match => {
                    const matchId = match.id.split('_')[0];
                    return matchId !== client.member_no.toString() && match.id.endsWith('_profile');
                })
                .slice(0, 3)
                .map(async (match, index) => {
                    try {
                        const matchedClientId = parseInt(match.id.split('_')[0]);
                        const matchedClient = data.find(c => c.member_no === matchedClientId);

                        if (!matchedClient) {
                            console.warn(`Matched client with ID ${matchedClientId} not found in data`);
                            return null; // We'll filter out these null values later
                        }

                        const descriptions = await generateDescriptions(client, matchedClient);

                        return {
                            "Match ID": (allMatches.length + index + 1).toString(),
                            "Member ID": client.member_no.toString(),
                            "Match Member ID": matchedClientId.toString(),
                            "Company": matchedClient.company || "N/A",
                            "Title": matchedClient.title || "N/A",
                            "Relevance": descriptions.relevance,
                            "Why it's good fit": descriptions.why
                        };
                    } catch (error) {
                        console.error(`Error processing match for client ${client.member_no}:`, error);
                        return null; // We'll filter out these null values later
                    }
                }));

            // Filter out null values (failed matches)
            const validClientMatches = clientMatches.filter(match => match !== null);

            console.log("client: ", client);
            console.log("clientMatches: ", validClientMatches);

            // Only generate summary and add to allMatches if there are valid matches
            if (validClientMatches.length > 0) {
                // Generate overall summary for this client's matches
                const overallSummary = await generateOverallSummary(client, validClientMatches);

                // Add client's matches and their overall summary to allMatches
                allMatches.push(...validClientMatches);
                allMatches.push({
                    "Overall Summary": overallSummary
                });
            } else {
                console.warn(`No valid matches found for client ${client.member_no}`);
            }

        }
        console.log("allMatches: ", allMatches)
        const jsonOutput = JSON.stringify(allMatches, null, 2);
        console.log("jsonOutput: ", jsonOutput)

        // Create Excel file from allMatches
        const newWorkbook = XLSX.utils.book_new();
        const newWorksheet = XLSX.utils.json_to_sheet(allMatches);

        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Matches');

        const filename = `matches_${Date.now()}.xlsx`;
        XLSX.writeFile(newWorkbook, filename);
        const excelBuffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });

        // Set headers for file download
        // Create text file
        const textContent = `Total token consumption: ${total_tokens}`;
        const textBuffer = Buffer.from(textContent);

        // Create a zip file
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        // Set the headers for zip file download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="matches_and_tokens_${Date.now()}.zip"`);

        fs.writeFile("total_token_consumption", textContent, (err) => {
            if (err) {
                console.error('Error writing file:', err);
            } else {
                console.log('File has been successfully written.');
            }
        });
        // Pipe archive data to the response
        archive.pipe(res);

        // Append files to the zip
        archive.append(excelBuffer, { name: 'matches.xlsx' });
        archive.append(textBuffer, { name: 'total_token_consumption.txt' });

        // Finalize the archive and send the response
        await archive.finalize();
        // Send both JSON and Excel file as response


    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).send('Error processing file');
    }
});

async function getEmbedding(text) {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });
    return response.data[0].embedding;
}

async function generateDescriptions(client, matchedClient) {
    const Match = z.object({
        "Relevance": z.string(),
        "Why it's a good fit": z.string()
    });


    const prompt = `
    Original Client:
    Company: ${client.company}
    Title: ${client.title}
    Expertise: ${client.expertise}
    I Refer: ${client.i_refer}
    I Have: ${client.i_have}
    I Want: ${client.i_want}

    Matched Client:
    Company: ${matchedClient.company}
    Title: ${matchedClient.title}
    Expertise: ${matchedClient.expertise}
    I Refer: ${matchedClient.i_refer}
    I Have: ${matchedClient.i_have}
    I Want: ${matchedClient.i_want}

    Based on the information provided for both the Original Client and the Matched Client, please provide:
    1. A detailed relevance description (minimum 50 words) explaining why these clients are a good match. Focus on how their expertise, needs, and offerings complement each other.
    2. A thorough explanation (minimum 50 words) of why this match is beneficial for both parties. Highlight specific ways they could collaborate or help each other's businesses.

    Example Output:
    {
        "Relevance": "Ray has extensive resources and connections with interior designers across Taiwan, specializing in both residential and commercial spaces. His network includes professionals experienced in designing hotels, offices, and clinics, which matches Gask's requirements.",
        "Why it's a good fit": "Ray's vast network of interior designers and expertise in commercial space design can provide Gask with the necessary resources to find the perfect designers for their projects. This partnership ensures that Gask can deliver high-quality, customized design solutions for various commercial spaces."
    }
    Format the response as a JSON object with keys "relevance" and "why".
    `;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                "role": "user", "content": prompt
            }
        ],
        response_format: zodResponseFormat(Match, "match_reasoning"),
        temperature: 0.7,
        max_tokens: 16384
    });


    const result = JSON.parse(completion.choices[0].message.content);
    console.log("result: ", result)
    console.log("completion: ", completion.choices[0].message.content)
    total_tokens = total_tokens + completion.usage.total_tokens
    // Validate the result against the Zod schema
    const validatedResult = Match.parse(result);
    console.log("validatedResult: ", validatedResult)
    return {
        relevance: validatedResult.Relevance,
        why: validatedResult["Why it's a good fit"]
    };
}

async function generateOverallSummary(client, matches) {
    const prompt = `
    Client:
    Company: ${client.company}
    Title: ${client.title}
    Expertise: ${client.expertise}
    I Refer: ${client.i_refer}
    I Have: ${client.i_have}
    I Want: ${client.i_want}

    Matches:
    ${JSON.stringify(matches, null, 2)}

    Please provide a detailed overall summary (minimum 100 words) explaining why these matches are suitable for the client, considering all aspects. Address how these matches collectively meet the client's needs and complement their expertise. Highlight any patterns or themes among the matches that make them particularly valuable for the client.

    Format the response as a simple string.
    Example Output:
    "These matches are selected based on their potential alignment with Gask's need for expertise in commercial space design, particularly in integrating customer insights, sustainability, and technological advancements into their projects."
    
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                "role": "user", "content": prompt
            }
        ],
        temperature: 0.7
    });
    total_tokens = total_tokens + response.usage.total_tokens
    return response.choices[0].message.content
}


app.get("/", (req, res) => {
    res.send("Hello World!");
})


app.listen(3001, () => console.log('Example app listening on port 3001!'));

