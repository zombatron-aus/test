export const MODULES = [
  {
    id: "introduction",
    title: "Welcome to Bright Waves",
    roles: ["admin", "instructor", "cs"],
    type: "intro",
    content:
`Congratulations on commencing your employment at Bright Waves Swim School!

This Employee Manual details the processes, expectations, and guidelines that we follow in our workplace.

As you make your way through the manual, you can click on the Bright Waves logo at any time to go back to the menu.

Should you have any questions, or require further clarification, please speak to your site manager.

We are excited to have you as part of the team!

Regards,
Brett Connors
Founder – Managing Director`,
  },
  {
    id: "vision",
    title: "Vision & Mission",
    roles: ["instructor", "cs"],
    type: "quiz",
    quiz: { q: "What is our mission focused on?", opts: ["Profit", "Creating confident swimmers", "Competition"], a: 1 },
  },
  {
    id: "attendance",
    title: "Attendance & Absence",
    roles: ["instructor", "cs"],
    type: "quiz",
    content: "Maintain 90% attendance. Call manager 2 hours before shift if unwell.",
    quiz: { q: "How many hours before shift must you call if sick?", opts: ["30 minutes", "1 hour", "2 hours"], a: 2 },
  },
  {
    id: "management",
    title: "Management Responsibilities",
    roles: ["admin"],
    type: "quiz",
    content: "Manager overview: monitoring attendance, availability, and compliance.",
    quiz: { q: "What should be monitored quarterly?", opts: ["Attendance", "Uniform", "Car parks"], a: 0 },
  },
];

export const DEFAULT_USERS = [
  {
    "id": "1",
    "name": "Admin User",
    "username": "admin",
    "pwd": {
      "algo": "pbkdf2-sha256",
      "iter": 200000,
      "salt": "3VoktdBOa/po+Jw56IaLPQ==",
      "dk": "tzRhbHh9mSuoLCAfsAiAzeqtCE+LwPdAkZl8MilE9Lk="
    },
    "roles": [
      "admin"
    ],
    "progress": {},
    "ack": {},
    "viewed": {}
  },
  {
    "id": "2",
    "name": "Swim Instructor",
    "username": "instructor",
    "pwd": {
      "algo": "pbkdf2-sha256",
      "iter": 200000,
      "salt": "TKYRXWtvsOIozyduJatHwQ==",
      "dk": "LFXacqhu0uYgbkEm09foP95BpmMgVKN+sOYvqaAWxaQ="
    },
    "roles": [
      "instructor"
    ],
    "progress": {},
    "ack": {},
    "viewed": {}
  },
  {
    "id": "3",
    "name": "Customer Service",
    "username": "cs",
    "pwd": {
      "algo": "pbkdf2-sha256",
      "iter": 200000,
      "salt": "7SyYM0zQuo+vg5tN4ieCDA==",
      "dk": "z8xInHEhiKi2Hk6FEQ9YNne1GQJ6BQupli+sGiv46jI="
    },
    "roles": [
      "cs"
    ],
    "progress": {},
    "ack": {},
    "viewed": {}
  }
];

