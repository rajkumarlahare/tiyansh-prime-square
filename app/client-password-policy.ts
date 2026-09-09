export const CLIENT_PASSWORD_MIN_LENGTH = 8;
export const CLIENT_PASSWORD_MAX_LENGTH = 128;
export const CLIENT_PASSWORD_HINT =
  "8+ characters: at least one letter and one number. Special character optional.";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALL = UPPER + LOWER + DIGITS;

function randomIndex(max: number) {
  if (!Number.isInteger(max) || max < 1) throw new Error("Invalid random range");

  const range = 0x1_0000_0000;
  const limit = range - (range % max);
  const value = new Uint32Array(1);

  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);

  return value[0] % max;
}

function pick(pool: string) {
  return pool[randomIndex(pool.length)];
}

function secureShuffle(values: string[]) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export function validClientPassword(value: string) {
  return (
    value.length >= CLIENT_PASSWORD_MIN_LENGTH &&
    value.length <= CLIENT_PASSWORD_MAX_LENGTH &&
    !/\s/.test(value) &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value)
  );
}

export function generateTemporaryClientPassword(
  length = CLIENT_PASSWORD_MIN_LENGTH,
) {
  const requested = Number.isFinite(length) ? Math.floor(length) : 0;
  const targetLength = Math.min(
    CLIENT_PASSWORD_MAX_LENGTH,
    Math.max(CLIENT_PASSWORD_MIN_LENGTH, requested),
  );

  // Client-friendly temporary password:
  // readable letters + numbers only, with an uppercase/lowercase/digit guaranteed.
  const values = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (values.length < targetLength) values.push(pick(ALL));

  return secureShuffle(values).join("");
}
