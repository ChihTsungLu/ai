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


const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

app.use(cors());
const upload = multer({ dest: 'uploads/' });
//RAG
// app.post("/rag", upload.single('file'), async (req, res) => {
//     if (!req.file) {
//         return res.status(400).send('No file uploaded.');
//     }
//     try {
//         const workbook = XLSX.readFile(req.file.path);
//         const sheetName = workbook.SheetNames[0];
//         const worksheet = workbook.Sheets[sheetName];
//         const data = XLSX.utils.sheet_to_json(worksheet);

//         const index = pinecone.Index('matchai');
//         console.log("data: ", data)
//         // Generate and store embeddings
//         for (const client of data) {
//             const fullProfile = `${client.company} ${client.title} ${client.expertise} ${client.i_refer} ${client.i_have}`;
//             const profileEmbedding = await getEmbedding(fullProfile);
//             const wantEmbedding = await getEmbedding(client.i_want);

//             await index.upsert([
//                 { id: `${client.member_no}_profile`, values: profileEmbedding },
//                 { id: `${client.member_no}_want`, values: wantEmbedding }
//             ]);
//         }

//         // Find matches and generate descriptions
//         const matches = [];
//         for (const client of data) {
//             const wantEmbedding = await getEmbedding(client.i_want);
//             const queryResponse = await index.query({
//                 vector: wantEmbedding,
//                 topK: 10,  // Increased to ensure we get enough profile matches
//                 filter: { id: { $regex: '_profile' } }  // Only query for profile embeddings
//             });

//             const clientMatches = await Promise.all(queryResponse.matches
//                 .filter(match => parseInt(match.id.split('_')[0]) !== client.member_no)
//                 .map(async (match) => {
//                     const matchedClientId = parseInt(match.id.split('_')[0]);
//                     const matchedClient = data.find(c => c.member_no === matchedClientId);

//                     const descriptions = await generateDescriptions(client, matchedClient);

//                     return {
//                         "Match ID": `remo${matches.length + 1}`,
//                         "Member ID": client.member_no,
//                         "Match Member ID": matchedClientId,
//                         "Company": matchedClient.company,
//                         "Title": matchedClient.title,
//                         "Relevance": descriptions.relevance,
//                         "Why": descriptions.why
//                     };
//                 }));
//             console.log("clientMatches: ", clientMatches)
//             matches.push(...clientMatches);

//             // Add overall summary
//             // const overallSummary = await generateOverallSummary(client, clientMatches);
//             // matches.push({
//             //     "Overall Summary": overallSummary
//             // });
//         }

//         // Create Excel file from matches
//         const newWorkbook = XLSX.utils.book_new();
//         const newWorksheet = XLSX.utils.json_to_sheet(matches, {
//             header: ["Match ID", "Member ID", "Match Member ID", "Company", "Title", "Relevance", "Why", "Overall Summary"],
//             skipHeader: false
//         });

//         XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Matches');

//         const filename = `matches_${Date.now()}.xlsx`;
//         XLSX.writeFile(newWorkbook, filename);

//         res.download(filename, (err) => {
//             if (err) {
//                 console.error('Error sending file:', err);
//                 res.status(500).send('Error sending file');
//             }
//         });

//     } catch (error) {
//         console.error('Error processing file:', error);
//         res.status(500).send('Error processing file');
//     }
// });

async function getEmbedding(text) {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });
    return response.data[0].embedding;
}

async function generateDescriptions(client, matchedClient) {
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
    1. A detailed relevance description (minimum 300 words) explaining why these clients are a good match. Focus on how their expertise, needs, and offerings complement each other.
    2. A thorough explanation (minimum 300 words) of why this match is beneficial for both parties. Highlight specific ways they could collaborate or help each other's businesses.

    Format the response as a JSON object with keys "relevance" and "why".
    `;

    const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
    });

    return JSON.parse(completion.choices[0].message.content);
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

    Please provide a detailed overall summary (minimum 200 words) explaining why these matches are suitable for the client, considering all aspects. Address how these matches collectively meet the client's needs and complement their expertise. Highlight any patterns or themes among the matches that make them particularly valuable for the client.

    Format the response as a simple string.
    `;

    const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
    });

    return completion.choices[0].message.content.trim();
}



function flattenJson(data) {
    // No need to flatten, as the data should already be in the correct format
    return data.map(item => ({
        "Match ID": item["Match ID"],
        "Member ID": item["Member ID"],
        "Match Member ID": item["Match Member ID"],
        "Company": item["Company"],
        "Title": item["Title"],
        "Relevance": item["Relevance"],
        "Why": item["Why"]
    }));
}

app.post("/ai", upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Define chunk size and create chunks
        const chunkSize = 50;
        const chunks = chunkArray(data, chunkSize);
        // Process all chunks
        const allResults = await processAllChunks(chunks);

        // Flatten and process the results
        const flattenedData = flattenResults(allResults);

        // Create a new workbook and worksheet
        const newWorkbook = XLSX.utils.book_new();
        const newWorksheet = XLSX.utils.json_to_sheet(flattenedData, {
            header: ["Match ID", "Member ID", "Match Member ID", "Company", "Title", "Relevance", "Why", "Overall Summary"],
            skipHeader: false
        });

        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Matches');

        // Generate a unique filename
        const filename = `matches_${Date.now()}.xlsx`;

        // Write the workbook to a file
        XLSX.writeFile(newWorkbook, filename);

        // Send the file as a response
        res.download(filename, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).send('Error sending file');
            }
        });

    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).send('Error processing file');
    }
});

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

async function processAllChunks(chunks) {
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkPrompt = generatePromptForChunk(chunk, i, chunks.length);
        const chunkResult = await makeAPICall(chunkPrompt);
        results.push(chunkResult);
    }
    return results;
}

function generatePromptForChunk(chunk, chunkIndex, totalChunks) {
    const chunkData = JSON.stringify(chunk);
    return `
        This is chunk ${chunkIndex + 1} of ${totalChunks} total chunks.
        Analyze the provided data and generate 3 ideal client matches for each member in this chunk. 
        Follow these guidelines strictly:

        1. Matches: Create 3 unique matches per member.

        2. Match Structure:
        - Assign a unique Match ID (e.g., remo1, remo2) to each match.
        - Ensure the Member ID corresponds to the original member being matched.

        3. Match Description:
        - Provide a detailed description of each match, minimum 200 words.
        - Include relevant background, skills, experiences, and qualities that make this a good match.

        4. Relevance:
        - Explain thoroughly why this match is relevant to the member.
        - Highlight specific points of compatibility or complementarity.

        5. Overall Summary:
        - After listing the matches for a member, provide an elaborated overall summary (minimum 200 words).
        - This summary should explain why these matches are suitable for the member, considering all aspects.

        6. Language and Detail:
        - Use English for all information.
        - Be specific, detailed, and contextual in all descriptions and explanations.

        7. Consistency:
        - Ensure every member in the chunk receives equal attention and detail in their matches and summaries.

        8. Format:
        - Present the information in a clear, structured format for easy reading and parsing.

        Data for this chunk: 
        ${chunkData}
    `;
}

async function makeAPICall(prompt) {

    const Match = z.object({
        "Match ID": z.string(),
        "Member ID": z.number(),
        "Match Member ID": z.number(),
        "Company": z.string(),
        "Title": z.string(),
        "Relevance": z.string(),
        "Why": z.string()
    });

    const OverallSummary = z.object({
        "Overall Summary": z.string()
    });

    const MatchOrSummary = z.union([Match, OverallSummary]);

    const MatchObject = z.object({
        matches: z.array(MatchOrSummary)
    });


    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                "role": "user", "content": prompt
            }
        ],
        response_format: zodResponseFormat(MatchObject, "match_reasoning"),
        temperature: 0.7,
        max_tokens: 16384,
    });
    return JSON.parse(completion.choices[0].message.content);
}

function flattenResults(results) {
    return results.flatMap(result => 
        result.matches.flatMap((item) => {
            const matchDetails = {
                "Match ID": item["Match ID"],
                "Member ID": item["Member ID"],
                "Match Member ID": item["Match Member ID"],
                "Company": item["Company"],
                "Title": item["Title"],
                "Relevance": item["Relevance"],
                "Why": item["Why"],
            };

            if (item["Overall Summary"]) {
                return [
                    matchDetails,
                    { "Overall Summary": item["Overall Summary"] }
                ];
            }

            return [matchDetails];
        })
    );
}


app.listen(3001, () => console.log('Example app listening on port 3001!'));

