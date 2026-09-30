/**
 * Storage abstraction layer for cross-platform compatibility
 * This module provides a unified interface for persistent storage
 * that can be adapted for web (localStorage) or mobile (AsyncStorage)
 */

/**
 * Check if localStorage is available
 * @returns {boolean}
 */
const isLocalStorageAvailable = () => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get an item from storage
 * @param {string} key - Storage key
 * @returns {any|null} Parsed value or null
 */
export const getItem = (key) => {
  if (!isLocalStorageAvailable()) return null;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`Error reading ${key} from storage:`, error);
    return null;
  }
};

/**
 * Set an item in storage
 * @param {string} key - Storage key
 * @param {any} value - Value to store (will be JSON stringified)
 * @returns {boolean} Success status
 */
export const setItem = (key, value) => {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error writing ${key} to storage:`, error);
    return false;
  }
};

/**
 * Get a string item from storage (no JSON parsing)
 * @param {string} key - Storage key
 * @returns {string|null}
 */
export const getString = (key) => {
  if (!isLocalStorageAvailable()) return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`Error reading ${key} from storage:`, error);
    return null;
  }
};

/**
 * Set a string item in storage (no JSON stringification)
 * @param {string} key - Storage key
 * @param {string} value - String value to store
 * @returns {boolean} Success status
 */
export const setString = (key, value) => {
  if (!isLocalStorageAvailable()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Error writing ${key} to storage:`, error);
    return false;
  }
};
