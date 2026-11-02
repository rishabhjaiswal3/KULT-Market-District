"use client";

export type MarketZone = "floor" | "research" | "risk" | "arena" | "results" | "office";
const stations: { id: MarketZone; name: string; sub: string; x: number; y: number; color: string; icon: string }[] = [
  { id: "floor", name: "TRADING FLOOR", sub: "play a case", x: 193, y: 174, color: "#deff47", icon: "◆" },
  { id: "research", name: "RESEARCH DESK", sub: "test the idea", x: 395, y: 174, color: "#b48cff", icon: "✦" },
  { id: "risk", name: "RISK OFFICE", sub: "guard the rules", x: 598, y: 174, color: "#3be4ce", icon: "◇" },
  { id: "arena", name: "MARKET ARENA", sub: "daily case", x: 193, y: 345, color: "#ffbd5e", icon: "★" },
  { id: "results", name: "RESULTS WALL", sub: "career record", x: 395, y: 345, color: "#62b9ff", icon: "▦" },
  { id: "office", name: "AGENCY OFFICE", sub: "your agent", x: 598, y: 345, color: "#ff779f", icon: "♜" },
];

export default function MarketWorld({ active, onSelect, completed, dailyLocked, activity = "" }: { active: MarketZone; onSelect: (zone: MarketZone) => void; completed: number; dailyLocked: boolean; activity?: string }) {
  const selected = stations.find(s => s.id === active)!;
  const staffStation = activity === "trend" || activity === "decide" ? "floor" : activity === "scenario" ? "risk" : activity === "council" ? "arena" : "research";
  const working = stations.find(s => s.id === staffStation)!;
  return <div className="market-world">
    <div className="market-world-head"><span>THE DISTRICT / INTERACTIVE MAP</span><span>{activity ? `● ${activity.toUpperCase()} AT WORK` : "SELECT A ROOM ↗"}</span></div>
    <svg viewBox="0 0 790 520" role="img" aria-label="Interactive isometric KULT Market District with six rooms">
      <defs><pattern id="districtGrid" width="42" height="42" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .48 -1 .48 315 0)"><path d="M42 0H0V42" fill="none" stroke="#3e6471" strokeWidth="1" opacity=".6"/></pattern><filter id="districtGlow"><feGaussianBlur stdDeviation="9"/></filter><linearGradient id="base" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#18373f"/><stop offset="1" stopColor="#091d28"/></linearGradient></defs>
      <rect width="790" height="520" fill="#071923"/><rect width="790" height="520" fill="url(#districtGrid)" opacity=".38"/>
      <path d="M395 25 770 245 395 485 20 245Z" fill="#081a20" stroke="#476974" strokeWidth="4"/>
      <path d="M395 17 770 238 395 478 20 238Z" fill="url(#base)" stroke="#637d81" strokeWidth="2"/>
      <path d="M39 241h708M394 32v427" stroke="#8dc2b0" strokeOpacity=".11" strokeWidth="3" strokeDasharray="7 10"/>
      {stations.map(s => { const isActive = s.id === active; return <g key={s.id} role="button" tabIndex={0} aria-label={`${s.name}, ${s.sub}`} className={`district-station ${isActive ? "active" : ""}`} onClick={() => onSelect(s.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.id); } }}>
        {isActive && <ellipse cx={s.x} cy={s.y + 35} rx="86" ry="45" fill={s.color} opacity=".35" filter="url(#districtGlow)"/>}
        <path d={`M${s.x} ${s.y-65} ${s.x+83} ${s.y-18} ${s.x} ${s.y+27} ${s.x-83} ${s.y-18}Z`} transform="translate(0 13)" fill="#09151f" opacity=".85"/>
        <path d={`M${s.x} ${s.y-65} ${s.x+83} ${s.y-18} ${s.x} ${s.y+27} ${s.x-83} ${s.y-18}Z`} fill={isActive ? "#29434a" : "#1a343d"} stroke={isActive ? s.color : "#52717a"} strokeWidth={isActive ? 3 : 1.5}/>
        <path d={`M${s.x-31} ${s.y-33} ${s.x+1} ${s.y-50} ${s.x+35} ${s.y-33} ${s.x+3} ${s.y-16}Z`} fill="#294b51" stroke="#719391" strokeWidth="1.3"/>
        <path d={`M${s.x-31} ${s.y-33} ${s.x+3} ${s.y-16} ${s.x+3} ${s.y+8} ${s.x-31} ${s.y-10}Z`} fill="#0c2a36" stroke="#4c6f77"/>
        <path d={`M${s.x+3} ${s.y-16} ${s.x+35} ${s.y-33} ${s.x+35} ${s.y-10} ${s.x+3} ${s.y+8}Z`} fill="#15363e" stroke="#4c6f77"/>
        <path d={`M${s.x-20} ${s.y-33} ${s.x+2} ${s.y-44} ${s.x+24} ${s.y-33} ${s.x+2} ${s.y-22}Z`} fill="#081c25" stroke={s.color} strokeWidth="1.8"/>
        <text x={s.x+2} y={s.y-28} fill={s.color} fontSize="12" textAnchor="middle">{s.icon}</text>
        <path d={`M${s.x-48} ${s.y+4} h96`} stroke={s.color} strokeOpacity={isActive ? ".75" : ".2"}/>
        <text x={s.x} y={s.y+49} fill={isActive ? s.color : "#dfeddf"} textAnchor="middle" fontSize="11" fontWeight="900" letterSpacing="1.4">{s.name}</text>
        <text x={s.x} y={s.y+64} fill="#97afb3" textAnchor="middle" fontSize="9">{s.sub}</text>
        {(s.id === "results" && completed > 0 || s.id === "arena" && dailyLocked) && <circle cx={s.x+61} cy={s.y-46} r="5" fill={s.color} className="station-pulse"/>}
      </g>; })}
      <g className="district-avatar" style={{ transform: `translate(${selected.x + 52}px, ${selected.y - 54}px)` }}><ellipse cx="0" cy="21" rx="16" ry="5" fill="#000" opacity=".5"/><circle cx="0" cy="0" r="8" fill="#ffd6a3" stroke="#102930" strokeWidth="2"/><path d="M-10 17Q0 7 10 17L8 27H-8Z" fill="#ddff4d" stroke="#102930" strokeWidth="2"/><path d="M-5 25l-5 11M5 25l5 11" stroke="#0e2027" strokeWidth="3"/></g>
      {activity && <g className="district-worker" style={{ transform: `translate(${working.x-44}px, ${working.y-52}px)` }}><circle r="16" fill={working.color} opacity=".25"/><circle r="7" fill="#fee2b9" stroke="#0e2027" strokeWidth="2"/><path d="M-8 13Q0 4 8 13L7 24H-7Z" fill={working.color} stroke="#0e2027" strokeWidth="2"/><text y="-22" textAnchor="middle" fontSize="8" fill={working.color} fontWeight="900">WORKING</text></g>}
      <text x="36" y="495" fill="#9db6b5" fontSize="10" letterSpacing="2">KULT WORLD / MARKET DISTRICT / SIMULATION ONLY</text>
    </svg>
    <div className="market-world-foot"><span className="market-live-dot"/> SIX CONNECTED ROOMS <span>◆</span> {completed} CASE{completed === 1 ? "" : "S"} RESOLVED <span>◆</span> ZERO LIVE TRADES</div>
  </div>;
}
