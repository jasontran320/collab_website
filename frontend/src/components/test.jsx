import React from "react";
import { useRealtimeCursors } from "../hooks/useRealtimeCursor";

// Simple consistent color generator per uid
const getColorForUid = (uid) => {
  const colors = [
    "#e63946", // red
    "#457b9d", // blue
    "#2a9d8f", // teal
    "#f4a261", // orange
    "#9b5de5", // purple
    "#f72585", // pink
    "#06d6a0", // mint
    "#ffb703", // yellow
  ];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function CursorTest() {
  const { cursors, updateCursor } = useRealtimeCursors("test-session");

  const handleMouseMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    updateCursor(x, y);
  };

  return (
    <div
      style={{
        height: "100vh",
        background: "#f9f9f9",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseMove={handleMouseMove}
    >
      {Object.entries(cursors).map(([uid, { x, y, displayName }]) => {
        const color = getColorForUid(uid);
        return (
          <div
            key={uid}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              zIndex: 9999,
              transition: "left 0.05s linear, top 0.05s linear", // smooth movement
            }}
          >
            {/* Name tag */}
            <div
              style={{
                backgroundColor: color,
                color: "white",
                fontSize: "12px",
                padding: "2px 6px",
                borderRadius: "4px",
                marginBottom: "2px",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </div>
            {/* Cursor arrow */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 2L18 8L10 10L8 18L2 2Z"
                fill={color}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
