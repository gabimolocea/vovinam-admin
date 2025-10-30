import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function NavListItem({ item, active }) {
  return (
    <RouterLink
      to={item.link}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors",
        active 
          ? "bg-primary/10 text-primary border-r-2 border-primary" 
          : "text-muted-foreground"
      )}
    >
      {item.icon && (
        <span className="text-inherit">
          {item.icon}
        </span>
      )}
      <span>{item.title}</span>
    </RouterLink>
  );
}
