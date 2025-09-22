import React from 'react';

export default function IconNotePencil({ width = 28, height = 28, stroke = '#f59e0b', pencilFill = '#2b7a2b', className, style }) {
  return (
    <svg
      className={className}
      style={style}
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      aria-hidden="true"
    >
      {/* note background */}
      <rect x="1.6" y="3.6" width="15.2" height="16.8" rx="2.2" fill="#fff" stroke={stroke} strokeWidth="1.6" />
      <path d="M1.6 6.1l7 4.8 7-4.8" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

      {/* pencil - slightly larger to balance icon weight */}
      <path d="M16.6 6.6l2.1 2.1L9.2 18.2 7.6 19.8c-.35.35-.95.35-1.3 0l-1.1-1.1c-.35-.35-.35-.95 0-1.3L6.6 16l9.9-9.4z" fill={pencilFill} />
      <path d="M18.4 5.2c.5-.5 1.2-.5 1.7 0 .5.5.5 1.2 0 1.7l-.7.7-2.1-2.1.9-.3z" fill={pencilFill} />
    </svg>
  );
}
