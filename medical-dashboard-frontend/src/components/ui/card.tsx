import React from 'react';

type DivProps = React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode };

export function Card({ className = '', children, ...rest }: DivProps) {
  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardContent({ className = '', children, ...rest }: DivProps) {
  return (
    <div className={`p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export default Card;