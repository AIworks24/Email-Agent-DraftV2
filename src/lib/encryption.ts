// src/lib/encryption.ts - FIXED for Node.js 18+
// Uses crypto.createCipheriv instead of deprecated createCipher

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm'; // More secure than CBC

export function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY) {
    console.warn('⚠️ ENCRYPTION_KEY not set, storing token unencrypted');
    return token;
  }

  if (!token || typeof token !== 'string') {
    console.warn('⚠️ Invalid token provided for encryption');
    return token;
  }

  try {
    // Create a 32-byte key from the hex string
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    
    if (key.length !== 32) {
      console.error('❌ ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
      return token; // Fallback to unencrypted
    }

    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);
    
    // Create cipher with key and IV
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt the token
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the auth tag (for GCM mode)
    const authTag = cipher.getAuthTag();
    
    // Return format: encrypted:iv:authTag:data
    return `encrypted:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('❌ Encryption failed:', error);
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

  // Check if token is encrypted
  if (!encryptedToken.startsWith('encrypted:')) {
    return encryptedToken; // Return as-is (unencrypted legacy token)
  }

  try {
    // Parse the encrypted format: encrypted:iv:authTag:data
    const parts = encryptedToken.replace('encrypted:', '').split(':');
    
    if (parts.length !== 3) {
      console.warn('⚠️ Malformed encrypted token, returning original');
      return encryptedToken;
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Create key from hex
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    
    if (key.length !== 32) {
      console.error('❌ ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
      return encryptedToken;
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt the token
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ Decryption failed:', error);
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

// Helper to generate a new encryption key (for setup)
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}