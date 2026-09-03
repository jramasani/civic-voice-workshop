import crypto from "node:crypto";

function workshopUser(nric, password, name, role) {
  const passwordSalt = `civicvoice-demo-${role}`;
  const passwordHash = crypto.pbkdf2Sync(password, passwordSalt, 120_000, 32, "sha256").toString("hex");
  return { nric, passwordSalt, passwordHash, name, role };
}

export const seedData = {
  users: [
    workshopUser("S0000001A", "citizen123", "Aisha Rahman", "citizen"),
    workshopUser("S0000002B", "admin123", "Daniel Tan", "admin"),
  ],
  feedback: [
    {
      id: "fb-seed-1", reference: "CV-000001",
      nric: "S0000001A",
      name: "Aisha Rahman",
      message: "The new sheltered walkway near the library is helpful, but the lights turn off too early.",
      category: "Other",
      status: "New",
      createdAt: "2026-08-29T09:14:00.000Z",
    },
  ],
};

export function freshSeed() {
  return structuredClone(seedData);
}
