import pdfParse from "pdf-parse";

export type ResumeAnalysis = {
  extractedText: string;
  suggestedRole: string;
  detectedSkills: string[];
};

type RoleProfile = {
  role: string;
  keywords: string[];
  skills: string[];
};

const ROLE_PROFILES: RoleProfile[] = [
  {
    role: "Full Stack Developer",
    keywords: ["full stack", "next.js", "react", "typescript", "node.js", "express", "postgresql", "prisma", "react native", "expo"],
    skills: ["Next.js", "React", "TypeScript", "Node.js", "Express.js", "PostgreSQL", "Prisma", "React Native"],
  },
  {
    role: "Frontend Developer",
    keywords: ["frontend", "react", "next.js", "typescript", "javascript", "tailwind", "html", "css", "ui"],
    skills: ["React", "Next.js", "TypeScript", "Tailwind CSS"],
  },
  {
    role: "Backend Developer",
    keywords: ["backend", "node.js", "express", "api", "postgresql", "mysql", "mongodb", "redis", "microservices"],
    skills: ["Node.js", "Express.js", "REST APIs", "PostgreSQL"],
  },
  {
    role: "Mobile App Developer",
    keywords: ["mobile", "react native", "expo", "android", "ios", "flutter", "kotlin", "swift"],
    skills: ["React Native", "Expo", "Android", "iOS"],
  },
  {
    role: "Data Analyst",
    keywords: ["data analyst", "sql", "python", "excel", "power bi", "tableau", "dashboard", "analytics"],
    skills: ["SQL", "Python", "Excel", "Power BI", "Dashboards"],
  },
];

export function slugifyResumeRole(role: string) {
  return role
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function scoreRole(text: string, profile: RoleProfile) {
  return profile.keywords.reduce((score, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = text.match(new RegExp(`\\b${escaped}\\b`, "gi"));
    return score + (matches?.length ?? 0);
  }, 0);
}

function detectRole(text: string) {
  const lowerText = text.toLowerCase();
  const scored = ROLE_PROFILES
    .map((profile) => ({ profile, score: scoreRole(lowerText, profile) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].profile : ROLE_PROFILES[0];
}

function detectSkills(text: string, profile: RoleProfile) {
  const lowerText = text.toLowerCase();
  const detected = profile.skills.filter((skill) => lowerText.includes(skill.toLowerCase()));
  return (detected.length ? detected : profile.skills).slice(0, 8);
}

export async function analyzeResumePdf(buffer: Buffer): Promise<ResumeAnalysis> {
  const parsed = await pdfParse(buffer);
  const extractedText = normalizeText(parsed.text).slice(0, 12000);
  const roleProfile = detectRole(extractedText);

  return {
    extractedText,
    suggestedRole: roleProfile.role,
    detectedSkills: detectSkills(extractedText, roleProfile),
  };
}
