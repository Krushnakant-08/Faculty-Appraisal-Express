import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { config } from '../config';

export interface JWTPayload extends JwtPayload {
  userId: string;
  role: string;
  email: string;
}

/**
 * Generate a JWT token
 */
export const generateToken = (
  userId: string,
  email: string,
  role: string,
  expiresIn?: string
): string => {
  const payload: JWTPayload = {
    userId,
    role,
    email
  };

  const options: SignOptions = {
    expiresIn: (expiresIn ?? config.jwtExpiresIn) as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, config.jwtSecret, options);
};

/**
 * Validate and verify a JWT token
 */
export const validateToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
    return decoded;
  } catch {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Decode a JWT token without verification (for debugging only)
 */
export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload | null;
  } catch {
    return null;
  }
};
