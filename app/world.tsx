"use client";

type Zone = "desk" | "lab" | "mandate" | "passport";
const rooms: { id: Zone; label: string; sub: string; x: number; y: number; color: string; edge: string; icon: string }[] = [
  { id: "lab", label: "RESEARCH", sub: "test the idea", x: 250, y: 188, color: "#7545ff", edge: "#4830ab", icon: "▤" },
  { id: "desk", label: "AGENT DESK", sub: "make the call", x: 478, y: 188, color: "#d7ff3d", edge: "#85b829", icon: "✦" },
  { id: "mandate", label: "RISK GATE", sub: "check the rules", x: 250, y: 343, color: "#26d6c0", edge: "#188c91", icon: "◇" },
  { id: "passport", label: "PASSPORT", sub: "record the result", x: 478, y: 343, color: "#ffb64b", edge: "#a86f34", icon: "◈" },
];

export default function World({ active, onSelect, agentName }: { active: Zone; onSelect: (zone: Zone) => void; agentName: string }) {
  return <div className="world-wrap">
    <div className="world-topline"><span className="world-label">KULT WORLD / MARKET DISTRICT / FLOOR 01</span><span className="world-hint">CLICK A ROOM TO EXPLORE ↗</span></div>
    <svg viewBox="0 0 730 500" className="world-svg" role="img" aria-label="Interactive isometric agent trading desk with four rooms">
      <defs>
        <pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .45 -1 .45 250 -45)"><path d="M 38 0 L 0 0 0 38" fill="none" stroke="#294151" strokeWidth="1" opacity=".7" /></pattern>
        <linearGradient id="floor" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#192c36"/><stop offset="1" stopColor="#0b1b23"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      <rect width="730" height="500" fill="#08151c" />
      <rect width="730" height="500" fill="url(#grid)" opacity=".52" />
      <ellipse cx="365" cy="384" rx="320" ry="66" fill="#d7ff3d" opacity=".06" filter="url(#glow)" />
      <path d="M365 78 702 256 365 444 28 256Z" fill="#06121a" stroke="#41606b" strokeWidth="3" />
      <path d="M365 68 702 246 365 434 28 246Z" fill="url(#floor)" stroke="#54717a" strokeWidth="2" />
      <path d="M365 78 365 422M43 246 685 246" stroke="#669090" strokeOpacity=".2" strokeWidth="2" strokeDasharray="8 8" />
      {rooms.map(room => {
        const selected = room.id === active;
        const x = room.x, y = room.y;
        return <g key={room.id} className={`room ${selected ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`${room.label}, ${room.sub}`} onClick={() => onSelect(room.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(room.id); } }}>
          {selected && <ellipse cx={x} cy={y + 39} rx="110" ry="60" fill={room.color} opacity=".20" filter="url(#glow)" />}
          <path d={`M${x} ${y-59} ${x+105} ${y-5} ${x} ${y+49} ${x-105} ${y-5}Z`} fill={room.edge} opacity=".68" transform="translate(0 18)" />
          <path d={`M${x} ${y-59} ${x+105} ${y-5} ${x} ${y+49} ${x-105} ${y-5}Z`} fill={selected ? "#213b40" : "#172d35"} stroke={selected ? room.color : "#40616b"} strokeWidth={selected ? 2.8 : 1.4} />
          <path d={`M${x-38} ${y-24} ${x+4} ${y-46} ${x+48} ${y-23} ${x+5} ${y-1}Z`} fill="#314c53" stroke="#6e8990" strokeWidth="1.2" />
          <path d={`M${x-38} ${y-24} ${x+5} ${y-1} ${x+5} ${y+21} ${x-38} ${y-2}Z`} fill="#0e262f" stroke="#51707a" />
          <path d={`M${x+5} ${y-1} ${x+48} ${y-23} ${x+48} ${y-1} ${x+5} ${y+21}Z`} fill="#163b41" stroke="#51707a" />
          <path d={`M${x-25} ${y-23} ${x+5} ${y-38} ${x+32} ${y-24} ${x+3} ${y-10}Z`} fill="#07161f" stroke={room.color} strokeWidth="2" />
          <path d={`M${x-16} ${y-22} ${x-4} ${y-28} ${x+5} ${y-23} ${x+17} ${y-29}`} fill="none" stroke={room.color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={x+61} cy={y-38} r="9" fill="#f7c69c" stroke="#08151c" strokeWidth="2" />
          <path d={`M${x+50} ${y-24} Q${x+61} ${y-32} ${x+72} ${y-24} L${x+69} ${y-6} ${x+53} ${y-6}Z`} fill={room.color} stroke="#07161f" strokeWidth="2" />
          <path d={`M${x+54} ${y-8} l-8 12 M${x+67} ${y-8} l9 10`} stroke="#101820" strokeWidth="3" />
          <circle cx={x-61} cy={y-8} r="4" fill={room.color} opacity={selected ? 1 : .5} />
          <text x={x-67} y={y+69} fill={selected ? room.color : "#d9e8e6"} fontSize="12" fontWeight="900" letterSpacing="2" textAnchor="start">{room.label}</text>
          <text x={x-67} y={y+83} fill="#8ca7aa" fontSize="9" textAnchor="start">{room.sub}</text>
          <text x={x-60} y={y-12} fill={room.color} fontSize="12" fontWeight="bold">{room.icon}</text>
        </g>;
      })}
      <path d="M100 405h135M495 65h133" stroke="#4c6d70" strokeWidth="1" opacity=".6" />
      <text x="100" y="397" fill="#93b0b0" fontSize="9" letterSpacing="2">PAPER OPERATIONS</text>
      <text x="498" y="59" fill="#93b0b0" fontSize="9" letterSpacing="2">AGENT: {agentName.toUpperCase().slice(0, 13)}</text>
    </svg>
    <div className="world-footer"><span className="pulse-dot"/> 4 ACTIVE STATIONS <span>◆</span> 1 SHARED PASSPORT <span>◆</span> 0 LIVE ORDERS</div>
  </div>;
}
