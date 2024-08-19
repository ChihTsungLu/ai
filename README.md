# MatchAI

MatchAI is an advanced application that helps clients efficiently match with their ideal customers. It leverages the power of React, Node.js, OpenAI, and Pinecone to deliver sophisticated natural language processing capabilities.

### Features

1. Client matching using AI-powered algorithms
2. Integration with OpenAI for natural language processing
3. Efficient data storage and retrieval using Pinecone vector database

### Prerequisites

1. An OpenAI API key
2. A Pinecone API key
3. NodeJS installed

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/ChihTsungLu/ai.git
   cd frontend
   cd backend
   ```
2. Install dependencies
   ```
   cd frontend
   npm install
   cd ../backend
   npm install
   ```

### Configuration

1. Create a .env file in the backend directory and add the following environment variables:

   ```
   OPENAI_API_KEY=YOUR_OPENAI_API_KEY
   PINECONE_API_KEY=YOUR_PINECONE_API_KEY
   ```
2. Set up Pinecone:

Create an index named matchai in your Pinecone account, and the dimension is 1536, since this project is using `text-embedding-3-small` from OpenAI
If you want to use a different index name, update the following line in your backend code:
   ```
   const index = pinecone.Index('YOUR_INDEX_NAME');
   ```

### Running the Development Server

1. Start the backend server:
   ```
   cd backend
   npm start
   ```

2. In a new terminal, start the frontend development server:
   ```
   cd frontend
   npm start
   ```
3. Open your browser and navigate to http://localhost:3000 to access the application.

### Technologies Used

1. Frontend: React
2. Backend: Node.js, Express
3. AI Integration: OpenAI API
4. Vector Database: Pinecone
