export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Çok zayıf" | "Zayıf" | "Orta" | "İyi" | "Güçlü";
  requirements: {
    length: boolean;
    letter: boolean;
    number: boolean;
  };
};

export function getPasswordStrength(password: string): PasswordStrength {
  const requirements = {
    length: password.length >= 8,
    letter: /[a-zA-ZÇĞİÖŞÜçğıöşü]/.test(password),
    number: /\d/.test(password),
  };

  if (!password) {
    return { score: 0, label: "Çok zayıf", requirements };
  }

  let score = Object.values(requirements).filter(Boolean).length;

  if (
    score === 3 &&
    password.length >= 12 &&
    /[^a-zA-ZÇĞİÖŞÜçğıöşü0-9]/.test(password)
  ) {
    score = 4;
  }

  const normalizedScore = Math.min(score, 4) as PasswordStrength["score"];
  const labels = ["Çok zayıf", "Zayıf", "Orta", "İyi", "Güçlü"] as const;

  return {
    score: normalizedScore,
    label: labels[normalizedScore],
    requirements,
  };
}

