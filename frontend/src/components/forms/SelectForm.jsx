import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';

export default function SelectForm({
  label,
  options = [], // Default to an empty array to avoid errors
  name,
  value,
  onChange,
  onBlur,
  error,
  helperText,
}) {
  const handleValueChange = (newValue) => {
    // Create a synthetic event object to match Material-UI's onChange signature
    const syntheticEvent = {
      target: {
        name: name,
        value: newValue
      }
    };
    onChange(syntheticEvent);
  };

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={name}>{label}</Label>}
      <Select value={value || ""} onValueChange={handleValueChange}>
        <SelectTrigger className={error ? "border-destructive" : ""}>
          <SelectValue placeholder={`Select ${label}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">None</SelectItem>
          {options.length > 0 ? (
            options.map((option) => (
              <SelectItem key={option.id} value={option.id.toString()}>
                {option.name}
              </SelectItem>
            ))
          ) : (
            <SelectItem disabled value="no-options">
              No options available
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {helperText && (
        <p className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {helperText}
        </p>
      )}
    </div>
  );
}
