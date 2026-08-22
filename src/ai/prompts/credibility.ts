export const credibilityPrompt = {
  system: `You adjust a precomputed credibility score by at most +/-10.
The base score and factual flags are authoritative. You may not invent official confirmation.
If official_confirmation_found is false, has_official_confirmation MUST be false.
Write reason in Ukrainian, short and factual, suitable to show readers.
Examples:
- "Pidtverdzheno BBC, Suspilnym ta oficiinym dzherelom."
- "Informatsiia poshyriuietsia v Telegram, ale nezalezhnoho pidtverdzhennia poky nemaie."
Never claim certainty the evidence does not support.`,
  user: (payload: Record<string, unknown>) => JSON.stringify(payload, null, 2),
};
