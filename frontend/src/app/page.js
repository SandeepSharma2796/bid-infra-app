'use client';
import React, { useState } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [textInput, setTextInput] = useState('');
  
  // Now using an array to store multiple files
  const [globalFiles, setGlobalFiles] = useState([]); 

  const handleNewChat = async () => {
    setMessages([]);
    setGlobalFiles([]); // Clear all uploaded files on reset
    setStatusMessage('');
    try {
      await fetch('http://localhost:8000/api/clear-session', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  // Handler to ADD files to the existing array
  const handleFileUpload = (event) => {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length > 0) {
      setGlobalFiles((prev) => [...prev, ...selectedFiles]);
      // Reset input value so the same file can be selected again if needed
      event.target.value = null; 
    }
  };

  // Handler to DELETE a specific file from the array
  const removeFile = (indexToRemove) => {
    setGlobalFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const runModulePipeline = async (moduleType) => {
    if (globalFiles.length === 0) {
      alert("⚠️ Please add at least one master file first!");
      return;
    }

    setLoading(true);
    setStatusMessage("📂 Generating " + moduleType.toUpperCase() + " from " + globalFiles.length + " file(s)...");
    
    const uploadForm = new FormData();
    // Append all files to the form data under the same key 'file'
    globalFiles.forEach((file) => {
      uploadForm.append('file', file);
    });
    uploadForm.append('module_type', moduleType);

    try {
      const res = await fetch('http://localhost:8000/api/upload-tender', {
        method: 'POST',
        body: uploadForm,
      });
      
      if (!res.ok) throw new Error("Backend connection failed.");
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: 'user', text: `Generated automated ${moduleType.toUpperCase()} report from ${globalFiles.length} file(s).` },
        { role: 'model', text: data.text, pdfData: data.pdfData, fileName: data.fileName }
      ]);
    } catch (err) {
      alert("⚠️ Backend connection failed. Ensure your Anaconda Prompt is running uvicorn on port 8000 and accepts multiple files!");
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const submitTextPrompt = async (e) => {
    e.preventDefault();
    if (!textInput.trim() || loading) return;

    const queryText = textInput;
    setTextInput('');
    setLoading(true);
    
    // UPDATED: Changed from Gemini to AI is working
    setStatusMessage("🧠 AI is working on context paths...");

    setMessages((prev) => [...prev, { role: 'user', text: queryText }]);

    try {
      const res = await fetch('http://localhost:8000/api/chat-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_message: queryText }),
      });
      
      if (!res.ok) throw new Error("Failed to process conversation thread.");
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: 'model', text: data.text, pdfData: data.pdfData, fileName: data.fileName }
      ]);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <div style={{ padding: '25px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Arial, sans-serif', backgroundColor: '#000', minHeight: '100vh', color: '#fff' }}>
      
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', paddingBottom: '15px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Bid Management AI Terminal</h2>
          {globalFiles.length > 0 ? (
            <span style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 'bold' }}>📄 Target Active: {globalFiles.length} File(s) loaded</span>
          ) : (
            <span style={{ fontSize: '13px', color: '#555' }}>Workspace Ready. Upload master file(s) to begin.</span>
          )}
        </div>
        
        {/* TOP RIGHT: Upload File & Reset Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ backgroundColor: '#111', padding: '8px 12px', borderRadius: '6px', border: '1px solid #333' }}>
            <span style={{ fontSize: '12px', color: '#aaa', marginRight: '10px' }}>📁 Add Files:</span>
            <input 
              type="file" 
              accept=".pdf" 
              multiple 
              onChange={handleFileUpload} 
              style={{ fontSize: '12px', color: '#fff', width: '180px' }} 
            />
          </div>
          <button onClick={handleNewChat} style={{ padding: '10px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
            Reset Session
          </button>
        </div>
      </header>

      {/* Workspace File Manager */}
      {globalFiles.length > 0 && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#0a0a0a', borderRadius: '8px', border: '1px solid #222' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Active Workspace Files
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {globalFiles.map((f, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', backgroundColor: '#1a1a1a', padding: '8px 12px', borderRadius: '6px', border: '1px solid #333' }}>
                <span style={{ fontSize: '12px', color: '#3b82f6', marginRight: '10px', fontWeight: 'bold' }}>
                  📄 {f.name}
                </span>
                <button 
                  onClick={() => removeFile(idx)} 
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', padding: '0 4px' }}
                  title="Remove this file"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
        {[
          { id: 'synopsis', label: 'Synopsis' },
          { id: 'scope', label: 'Scope of Work' },
          { id: 'ppt', label: 'Bid PPT Outline' },
          { id: 'risk', label: 'Risk Register' }
        ].map((item) => (
          <button 
            key={item.id} 
            onClick={() => runModulePipeline(item.id)}
            style={{ 
              backgroundColor: '#111', 
              border: '1px solid #222', 
              padding: '20px', 
              borderRadius: '8px', 
              textAlign: 'center',
              cursor: 'pointer',
              color: '#3b82f6',
              fontSize: '15px',
              fontWeight: 'bold',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#1e293b'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#111'}
          >
            Generate {item.label}
          </button>
        ))}
      </div>

      {/* Chat Log Viewport */}
      <div style={{ border: '1px solid #222', height: '400px', overflowY: 'auto', padding: '25px', borderRadius: '8px', backgroundColor: '#050505', marginBottom: '20px' }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#444', marginTop: '130px' }}>
            <p style={{ fontSize: '15px', fontWeight: 'bold', color: '#666', margin: '0 0 4px 0' }}>Workspace Log Standby</p>
            <p style={{ fontSize: '13px', color: '#333' }}>Upload files top right, click a module, or ask a question below.</p>
          </div>
        )}
        
        {messages.map((msg, index) => (
          <div key={index} style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: '11px', color: '#444', marginBottom: '4px', fontWeight: 'bold' }}>
              {/* UPDATED: Changed from Gemini AI to BID MANAGEMENT AI */}
              {msg.role === 'user' ? '👤 PROMPT' : '✨ BID MANAGEMENT AI'}
            </span>
            <div style={{ display: 'inline-block', maxWidth: '85%', padding: '14px 18px', borderRadius: '8px', backgroundColor: msg.role === 'user' ? '#1e40af' : '#111', color: '#fff', border: '1px solid #222' }}>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.6' }}>{msg.text}</p>
              {msg.pdfData && (
                <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #222', textAlign: 'right' }}>
                  <a href={msg.pdfData} download={msg.fileName} style={{ display: 'inline-flex', alignItems: 'center', fontSize: '12px', textDecoration: 'none', color: '#3b82f6', fontWeight: 'bold', backgroundColor: '#000', padding: '6px 12px', borderRadius: '4px', border: '1px solid #1d4ed8' }}>
                    📥 Download Report (PDF)
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ padding: '12px', backgroundColor: '#022c22', border: '1px solid #064e3b', borderRadius: '6px', color: '#34d399', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '12px', height: '12px', border: '2px solid #34d399', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <strong>{statusMessage}</strong>
          </div>
        )}
      </div>

      {/* Follow Up Input Tray */}
      <form onSubmit={submitTextPrompt} style={{ display: 'flex', gap: '12px' }}>
        <input 
          type="text" 
          value={textInput} 
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Ask a question about the active workspace files..." 
          style={{ flexGrow: 1, padding: '16px', backgroundColor: '#111', border: '1px solid #222', borderRadius: '8px', fontSize: '14px', color: '#fff', outline: 'none' }}
        />
        <button type="submit" style={{ padding: '0 30px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
          Send
        </button>
      </form>

      <style dangerouslySetInnerHTML={{__html: `@keyframes spin { to { transform: rotate(360deg); } }`}} />
    </div>
  );
}