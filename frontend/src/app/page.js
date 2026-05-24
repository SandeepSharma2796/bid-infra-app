'use client';
import React, { useState } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [textInput, setTextInput] = useState('');
  const [activeFile, setActiveFile] = useState(null);

  const handleNewChat = async () => {
    setMessages([]);
    setActiveFile(null);
    setStatusMessage('');
    try {
      await fetch('http://localhost:8000/api/clear-session', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  const runModulePipeline = async (event, moduleType) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    setLoading(true);
    setStatusMessage("📂 Processing: " + selectedFile.name);
    
    const uploadForm = new FormData();
    uploadForm.append('file', selectedFile);
    uploadForm.append('module_type', moduleType);

    try {
      const res = await fetch('http://localhost:8000/api/upload-tender', {
        method: 'POST',
        body: uploadForm,
      });
      
      if (!res.ok) throw new Error("Backend connection failed.");
      const data = await res.json();

      setActiveFile(data.activeFile);
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: "Generated automated " + moduleType.toUpperCase() + " report pipeline." },
        { role: 'model', text: data.text, pdfData: data.pdfData, fileName: data.fileName }
      ]);
    } catch (err) {
      alert("⚠️ Backend connection failed. Ensure your Anaconda Prompt is running uvicorn on port 8000!");
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
    setStatusMessage("🧠 Gemini AI is analyzing context paths...");

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
          {activeFile ? (
            <span style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 'bold' }}>📄 Target Active: {activeFile}</span>
          ) : (
            <span style={{ fontSize: '13px', color: '#555' }}>Workspace Ready. Assign file parameters below.</span>
          )}
        </div>
        <button onClick={handleNewChat} style={{ padding: '10px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
          Reset Session
        </button>
      </header>

      {/* Module Form Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
        {[
          { id: 'synopsis', label: 'Synopsis' },
          { id: 'scope', label: 'Scope of Work' },
          { id: 'ppt', label: 'Bid PPT Outline' },
          { id: 'risk', label: 'Risk Register' }
        ].map((item) => (
          <div key={item.id} style={{ backgroundColor: '#111', border: '1px solid #222', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#3b82f6', marginBottom: '10px' }}>{item.label}</span>
            <input 
              type="file" 
              accept=".pdf" 
              onChange={(e) => runModulePipeline(e, item.id)} 
              style={{ fontSize: '11px', color: '#888', width: '100%' }} 
            />
          </div>
        ))}
      </div>

      {/* Chat Log Viewport */}
      <div style={{ border: '1px solid #222', height: '440px', overflowY: 'auto', padding: '25px', borderRadius: '8px', backgroundColor: '#050505', marginBottom: '20px' }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#444', marginTop: '150px' }}>
            <p style={{ fontSize: '15px', fontWeight: 'bold', color: '#666', margin: '0 0 4px 0' }}>Workspace Log Standby</p>
            <p style={{ fontSize: '13px', color: '#333' }}>Responses and document downloads will render inside this container.</p>
          </div>
        )}
        
        {messages.map((msg, index) => (
          <div key={index} style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <span style={{ fontSize: '11px', color: '#444', marginBottom: '4px', fontWeight: 'bold' }}>
              {msg.role === 'user' ? '👤 PROMPT' : '✨ GEMINI AI'}
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
          placeholder="Ask a question or type 'Hello' here..." 
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