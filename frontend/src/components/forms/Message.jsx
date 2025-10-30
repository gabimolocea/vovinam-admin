import * as React from 'react';
import { Alert, AlertDescription } from '../ui/alert';

export default function MyMessage({messageText, messageColor}) {
  // Map background colors to Alert variants
  const getVariant = (color) => {
    if (color === 'red' || color === '#ef4444' || color === 'error') {
      return 'destructive';
    }
    return 'default';
  };

  return (
    <Alert variant={getVariant(messageColor)} className="mb-5">
      <AlertDescription>
        {messageText}
      </AlertDescription>
    </Alert>
  );
} 