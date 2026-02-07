import React, { useState, useRef } from 'react';

/**
 * QR Code Scanner Component
 * Uses device camera to scan referee QR codes
 */
export default function QRScanner({ onScanned }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const startScanning = async () => {
    try {
      setScanning(true);
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanQRCode();
      }
    } catch (err) {
      setError('Unable to access camera. Please allow camera permissions.');
      setScanning(false);
    }
  };

  const scanQRCode = () => {
    if (!scanning || !videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // In production, use qr-code-styling or jsQR library
    // For now, show placeholder
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // TODO: Implement actual QR code detection
    // This would use jsQR library to detect QR codes

    // Simulate QR code scanning
    setTimeout(scanQRCode, 100);
  };

  const stopScanning = () => {
    setScanning(false);
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const handleManualEntry = (e) => {
    e.preventDefault();
    const qrCode = e.target.qr_input.value;
    if (qrCode) {
      stopScanning();
      onScanned({ code: qrCode });
    }
  };

  return (
    <div className="qr-scanner">
      {!scanning ? (
        <div className="scanner-start">
          <p className="scanner-icon">📱</p>
          <button onClick={startScanning} className="btn-primary large">
            Start Camera Scan
          </button>
          
          <div className="or-divider">or</div>

          <form onSubmit={handleManualEntry} className="manual-entry">
            <input
              type="text"
              name="qr_input"
              placeholder="Enter QR code manually"
              required
            />
            <button type="submit" className="btn-secondary">
              Submit
            </button>
          </form>
        </div>
      ) : (
        <div className="scanner-active">
          <video ref={videoRef} className="scanner-video" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="scanner-overlay">
            <div className="scanner-box" />
            <p>Point camera at QR code</p>
          </div>
          <button onClick={stopScanning} className="btn-secondary">
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}
    </div>
  );
}
