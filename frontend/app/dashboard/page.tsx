"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Brain, CheckCircle2, Flame, Target } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ThemeToggle } from "../components/ThemeToggle";

const historicalScores = [
  { session: "V1", score: 62, clarity: 58, technicalAccuracy: 66 },
  { session: "V2", score: 68, clarity: 64, technicalAccuracy: 70 },
  { session: "V3", score: 65, clarity: 72, technicalAccuracy: 61 },
  { session: "V4", score: 74, clarity: 75, technicalAccuracy: 73 },
  { session: "V5", score: 78, clarity: 81, technicalAccuracy: 76 },
  { session: "V6", score: 84, clarity: 86, technicalAccuracy: 82 },
  { session: "V7", score: 88, clarity: 92, technicalAccuracy: 85 },
];

const skillScores = [
  { skill: "Clarity", value: 92 },
  { skill: "Accuracy", value: 85 },
  { skill: "Evidence", value: 81 },
  { skill: "Pace", value: 74 },
  { skill: "Depth", value: 88 },
];

export default function DashboardPage() {
  return <main className="page-grid min-h-screen"><div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8"><header className="flex items-center justify-between"><Link href="/" className="flex min-h-[48px] items-center gap-2 text-sm font-semibold text-[var(--muted)]"><ArrowLeft className="h-4 w-4" /> VivaLens AI</Link><ThemeToggle /></header><section className="pb-8 pt-8 sm:pt-12"><p className="text-xs font-bold uppercase tracking-[.22em] text-teal-600 dark:text-teal-300">Your practice log</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-[var(--font-display)] text-4xl font-bold">Momentum, measured.</h1><p className="mt-2 text-[var(--muted)]">A clear view of how you show up under questioning.</p></div><Link href="/viva" className="button-primary min-h-[48px]">New viva <ArrowUpRight className="h-4 w-4" /></Link></div></section><div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><section className="panel min-w-0 p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-[var(--muted)]">Historical performance</p><p className="mt-1 font-[var(--font-display)] text-4xl font-bold">84<span className="text-xl text-teal-500">%</span></p></div><div className="rounded-lg bg-teal-100 p-3 text-teal-700 dark:bg-teal-950 dark:text-teal-300"><Target className="h-5 w-5" /></div></div><div className="mt-6 h-[300px] w-full"><ResponsiveContainer width="100%" height={300}><LineChart data={historicalScores} margin={{ top: 10, right: 8, left: -18, bottom: 8 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="session" axisLine={false} tickLine={false} tick={{ fill: "#71818a", fontSize: 12 }} /><YAxis domain={[40, 100]} ticks={[40, 60, 80, 100]} axisLine={false} tickLine={false} tick={{ fill: "#71818a", fontSize: 12 }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #d9e4df" }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Line type="monotone" dataKey="score" name="Overall" stroke="#0b8f83" strokeWidth={3} dot={{ r: 3 }} /><Line type="monotone" dataKey="clarity" name="Clarity" stroke="#f59e0b" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="technicalAccuracy" name="Technical accuracy" stroke="#f43f5e" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></section><section className="panel min-w-0 p-5 sm:p-7"><div><p className="text-sm font-semibold text-[var(--muted)]">Viva profile</p><h2 className="mt-1 font-[var(--font-display)] text-2xl font-bold">Your strengths</h2></div><div className="mt-4 h-[300px] w-full"><ResponsiveContainer width="100%" height={300}><RadarChart data={skillScores} outerRadius="72%"><PolarGrid stroke="var(--line)" /><PolarAngleAxis dataKey="skill" tick={{ fill: "#71818a", fontSize: 11 }} /><PolarRadiusAxis domain={[0, 100]} tickCount={3} tick={{ fill: "#71818a", fontSize: 10 }} /><Radar name="Score" dataKey="value" stroke="#0b8f83" fill="#0b8f83" fillOpacity={0.28} /></RadarChart></ResponsiveContainer></div></section></div><section className="mt-5 grid gap-5 sm:grid-cols-3"><div className="panel flex min-h-[96px] items-center gap-4 p-5"><Flame className="h-6 w-6 text-orange-500" /><div><p className="text-2xl font-bold">6 days</p><p className="text-sm text-[var(--muted)]">current streak</p></div></div><div className="panel flex min-h-[96px] items-center gap-4 p-5"><Brain className="h-6 w-6 text-teal-600" /><div><p className="text-2xl font-bold">12.4 hrs</p><p className="text-sm text-[var(--muted)]">practice time</p></div></div><div className="panel flex min-h-[96px] items-center gap-4 p-5"><CheckCircle2 className="h-6 w-6 text-emerald-500" /><div><p className="text-2xl font-bold">08</p><p className="text-sm text-[var(--muted)]">vivas completed</p></div></div></section></div></main>;
}
