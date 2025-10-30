import * as React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export default function TextForm({label, before, value, name, onChange, onBlur, error, helperText}) {
  return (
    <div className="space-y-2">
      {label && <Label htmlFor={name}>{label}</Label>}
      <div className="relative">
        {before && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
            {before}
          </div>
        )}
        <Input
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className={`${error ? "border-destructive" : ""} ${before ? "pl-10" : ""}`}
        />
      </div>
      {helperText && (
        <p className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {helperText}
        </p>
      )}
    </div>
  );
}