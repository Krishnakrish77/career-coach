export function gradeFromScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function validateAtsScore(score) {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("ATS score must be an integer from 0 to 100.");
  }
  return score;
}
