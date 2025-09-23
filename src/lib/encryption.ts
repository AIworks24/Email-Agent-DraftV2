// src/lib/encryption.ts - Safe, Compatible Token Encryption
// Uses standard AES encryption without deprecated methods

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc'; // Using CBC mode for better compatibility

export function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY) {
    // Fallback: return unencrypted if key not set (maintains compatibility)
    console.warn('ENCRYPTION_KEY not set, storing token unencrypted');
    return token;
  }

  if (!token || typeof token !== 'string') {
    console.warn('Invalid token provided for encryption');
    return token;
  }

  try {
    // Create a 32-byte key from the hex string
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (key.length !== 32) {
      console.error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
      return token; // Fallback
    }

    // Generate random IV
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipher(ALGORITHM, key);
    
    // Encrypt the token
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return encrypted format: encrypted:iv:data
    return `encrypted:${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed, storing unencrypted:', error);
    return token; // Fallback to maintain functionality
  }
}

export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken || typeof encryptedToken !== 'string') {
    return '';
  }

  if (!ENCRYPTION_KEY) {
    return encryptedToken; // No key = assume unencrypted
  }

  // Check if token is already encrypted
  if (!encryptedToken.startsWith('encrypted:')) {
    return encryptedToken; // Return as-is (unencrypted legacy token)
  }

  try {
    const parts = encryptedToken.replace('encrypted:', '').split(':');
    if (parts.length !== 2) {
      console.warn('Malformed encrypted token, returning original');
      return encryptedToken; // Malformed, return as-is
    }

    // Create key from hex
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (key.length !== 32) {
      console.error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
      return encryptedToken; // Return as-is
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    // Create decipher
    const decipher = crypto.createDecipher(ALGORITHM, key);
    
    // Decrypt the token
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed, returning original:', error);
    return encryptedToken; // Fallback to maintain functionality
  }
}

// Helper function to check if token is encrypted
export function isTokenEncrypted(token: string): boolean {
  return typeof token === 'string' && token.startsWith('encrypted:');
}

// Utility function to validate encryption key format
export function validateEncryptionKey(): boolean {
  if (!ENCRYPTION_KEY) {
    return false;
  }
  
  try {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    return key.length === 32; // 256 bits
  } catch {
    return false;
  }
}