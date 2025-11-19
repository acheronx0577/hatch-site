export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[\d\s\-\(\)]+$/;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && phoneRegex.test(phone);
};

export const isValidZipCode = (zip: string): boolean => {
  const zipRegex = /^\d{5}(-\d{4})?$/;
  return zipRegex.test(zip);
};

export const isValidURL = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const isValidPrice = (price: string | number): boolean => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return !isNaN(num) && num >= 0;
};

export const isEmptyOrWhitespace = (str: string): boolean => {
  return !str || str.trim().length === 0;
};

export const hasMinLength = (str: string, minLength: number): boolean => {
  return str.length >= minLength;
};

export const hasMaxLength = (str: string, maxLength: number): boolean => {
  return str.length <= maxLength;
};

export const isWithinRange = (value: number, min: number, max: number): boolean => {
  return value >= min && value <= max;
};
