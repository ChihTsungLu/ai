import React, { useState } from 'react';

const ExcelUploader = () => {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [excelFileInfo, setExcelFileInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event: any) => {
    const uploadedFile = event.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setError('');
      setSuccess('');
    }
  };

  const handleFileUpload = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      setError("");

      const response = await fetch('http://localhost:3001/rag', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'matches_and_tokens.zip';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Convert the response to a blob
      const blob = await response.blob();

      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a temporary anchor element and trigger the download
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess('Files processed and downloaded successfully');
    } catch (error) {
      setError('Error processing and downloading the files');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <h1>上傳 Excel File</h1>
      <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} />
      <button onClick={handleFileUpload}>Upload</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
      {loading && <p>正在處理中，請稍後...資料量大會花十分鐘左右</p>}
    </div>
  );
};

export default ExcelUploader;
