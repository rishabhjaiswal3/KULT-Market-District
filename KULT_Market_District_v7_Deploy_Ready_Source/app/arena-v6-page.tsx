"use client";
import { useEffect } from "react";
export default function ArenaV6() {
  useEffect(() => { document.title = "KULT Market District v6 — Playable Agency Arena"; }, []);
  return <main style={{width:"100%",height:"100dvh",background:"#080f17",margin:0,overflow:"hidden"}}>
    <iframe src="/market-arena-v6.html" title="KULT Market District v6 playable offline practice" style={{border:0,width:"100%",height:"100%"}} allow="clipboard-write" />
  </main>;
}
