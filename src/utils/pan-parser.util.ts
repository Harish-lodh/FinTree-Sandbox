/**
 * PAN Parser Utility
 * Extracts PAN number, name, DOB, and father name from OCR text lines
 */

/**
 * Result interface for PAN parsing
 */
export interface PanParseResult {
  panNumber: string | null;
  name: string | null;
  dob: string | null;
  fatherName: string | null;
}

/**
 * Parse PAN details from OCR text lines
 * @param lines - Array of text lines from OCR
 * @returns PanParseResult with extracted fields
 */
export function parsePanText(lines: string[]): PanParseResult {
  const result: PanParseResult = {
    panNumber: null,
    name: null,
    dob: null,
    fatherName: null,
  };

  if (!lines || lines.length === 0) {
    return result;
  }

  // Keep original lines for reference
  const originalLines = lines.map(line => line.trim());
  
  // Convert to uppercase for matching
  const upperLines = lines.map(line => line.toUpperCase().trim());

  // PAN number pattern
  const panPattern = /[A-Z]{5}[0-9]{4}[A-Z]/;
  const allText = upperLines.join(' ');
  const panMatch = allText.match(panPattern);
  if (panMatch) {
    result.panNumber = panMatch[0];
  }

  // Keywords to skip entirely
  const skipKeywords = [
    'INCOME TAX', 'TAX DEPARTMENT', 'DEPARTMENT', 'GOVT', 'GOVT OF INDIA',
    'PERMANENT', 'ACCOUNT', 'NUMBER', 'CARD', 'SIGNATURE', 'PHOTO', 'ADDRESS',
    'Signe', 'हस्ताक्षर', 'आयकर', 'विभाग', 'भारत', 'सरकार', 'सत्यमेव जयते',
    'स्थायी', 'लेखा', 'कार्ड', 'OFFICIAL', 'GOVRNMENT',
  ];

  // Field labels (case insensitive check done after uppercasing)
  const nameLabels = ['NAME', 'नाम', 'NAM', 'NAME:'];
  const fatherLabels = ['FATHER', 'पिता', 'F/N', 'S/O', 'FATHER NAME', 'FATHERS NAME', 'FATHER\'S NAME'];
  const dobLabels = ['DATE OF BIRTH', 'DOB', 'जन्म', 'BIRTH', 'DOB:'];

  // Helper to check if line should be skipped
  const shouldSkipLine = (line: string): boolean => {
    // Skip if contains only numbers or special chars
    if (!line.match(/[A-Z]/)) return true;
    // Skip if contains skip keywords
    if (skipKeywords.some(kw => line.includes(kw))) return true;
    return false;
  };

  // Find indices of labels
  const labelIndices: { type: string; index: number; value?: string }[] = [];

  for (let i = 0; i < upperLines.length; i++) {
    const line = upperLines[i];
    
    // Check for name label
    for (const label of nameLabels) {
      if (line.includes(label)) {
        // Get the next non-empty line as the value
        for (let j = i + 1; j < upperLines.length; j++) {
          const nextLine = upperLines[j];
          if (nextLine && !nextLine.match(/^[\d\/\-\.\s]+$/) && nextLine.length > 2) {
            // Make sure next line is not also a label
            const isLabel = nameLabels.some(l => nextLine.includes(l)) ||
                          fatherLabels.some(l => nextLine.includes(l)) ||
                          dobLabels.some(l => nextLine.includes(l));
            if (!isLabel && !shouldSkipLine(nextLine)) {
              labelIndices.push({ type: 'name', index: i, value: originalLines[j] });
              break;
            }
          }
        }
      }
    }

    // Check for father label
    for (const label of fatherLabels) {
      if (line.includes(label)) {
        for (let j = i + 1; j < upperLines.length; j++) {
          const nextLine = upperLines[j];
          if (nextLine && !nextLine.match(/^[\d\/\-\.\s]+$/) && nextLine.length > 2) {
            const isLabel = nameLabels.some(l => nextLine.includes(l)) ||
                          fatherLabels.some(l => nextLine.includes(l)) ||
                          dobLabels.some(l => nextLine.includes(l));
            if (!isLabel && !shouldSkipLine(nextLine)) {
              labelIndices.push({ type: 'father', index: i, value: originalLines[j] });
              break;
            }
          }
        }
      }
    }

    // Check for DOB label
    for (const label of dobLabels) {
      if (line.includes(label)) {
        for (let j = i + 1; j < upperLines.length; j++) {
          const nextLine = upperLines[j];
          const dobMatch = nextLine.match(/\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}/);
          if (dobMatch) {
            labelIndices.push({ type: 'dob', index: i, value: dobMatch[0] });
            break;
          }
        }
      }
    }
  }

  // Apply label-based findings (most reliable)
  const nameLabel = labelIndices.find(l => l.type === 'name');
  const fatherLabel = labelIndices.find(l => l.type === 'father');
  const dobLabel = labelIndices.find(l => l.type === 'dob');

  if (nameLabel && nameLabel.value) {
    result.name = nameLabel.value;
  }
  if (fatherLabel && fatherLabel.value) {
    result.fatherName = fatherLabel.value;
  }
  if (dobLabel && dobLabel.value) {
    result.dob = dobLabel.value;
  }

  // If we still don't have name or father, use fallback - look for capitalized names
  // that appear to be names (2-4 words, all letters, no numbers)
  if (!result.name || !result.fatherName) {
    const potentialNames: { line: string; index: number }[] = [];
    
    for (let i = 0; i < upperLines.length; i++) {
      const line = upperLines[i];
      // Name pattern: 2-5 words, all caps, no numbers, reasonable length
      const namePattern = /^[A-Z]{2,}(?:\s+[A-Z]{2,}){1,4}$/;
      
      if (namePattern.test(line) && 
          line.length > 3 && 
          line.length < 50 && 
          !shouldSkipLine(line) &&
          line !== result.panNumber) {
        potentialNames.push({ line: originalLines[i], index: i });
      }
    }

    // Try to assign based on position relative to PAN and labels
    if (result.panNumber) {
      const panIndex = upperLines.findIndex(l => l.includes(result.panNumber));
      
      // Filter names that appear before PAN (typical PAN card layout)
      const namesBeforePAN = potentialNames.filter(n => n.index < panIndex);
      
      if (!result.name && namesBeforePAN.length > 0) {
        // Name is usually the longest name before PAN, or the one closest to name label
        const nameCandidate = namesBeforePAN[namesBeforePAN.length - 1];
        result.name = nameCandidate.line;
      }
      
      if (!result.fatherName && namesBeforePAN.length > 1) {
        // Father's name is usually before name, but could be in different positions
        // Try to find it near father's name label if we have one
        if (fatherLabel) {
          const fatherCandidate = namesBeforePAN.find(n => n.index < fatherLabel.index);
          if (fatherCandidate) {
            result.fatherName = fatherCandidate.line;
          }
        } else {
          // Otherwise take the one that's clearly different from name
          const fatherCandidate = namesBeforePAN.find(n => n.line !== result.name);
          if (fatherCandidate) {
            result.fatherName = fatherCandidate.line;
          }
        }
      }
    }
  }

  // If still no father name, try to find it after name in the text
  if (!result.fatherName && result.name && result.panNumber) {
    const nameIndex = originalLines.findIndex(l => l.toUpperCase().includes(result.name?.toUpperCase() || ''));
    if (nameIndex >= 0) {
      // Look for father's name after name label or in nearby lines
      for (let i = nameIndex + 1; i < Math.min(nameIndex + 5, originalLines.length); i++) {
        const line = upperLines[i];
        const namePattern = /^[A-Z]{2,}(?:\s+[A-Z]{2,}){1,4}$/;
        if (namePattern.test(line) && !shouldSkipLine(line) && line !== result.name) {
          result.fatherName = originalLines[i];
          break;
        }
      }
    }
  }

  // Clean up extracted values
  if (result.name) {
    result.name = result.name.replace(/[^A-Z\s]/g, '').trim();
  }
  if (result.fatherName) {
    result.fatherName = result.fatherName.replace(/[^A-Z\s]/g, '').trim();
  }

  return result;
}

/**
 * Validate PAN number format
 * @param pan - PAN number to validate
 * @returns boolean
 */
export function isValidPanFormat(pan: string): boolean {
  if (!pan || pan.length !== 10) {
    return false;
  }
  const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  return panPattern.test(pan.toUpperCase());
}

/**
 * Mask PAN number for display
 * @param pan - PAN number to mask
 * @returns masked PAN (e.g., AAAPL1234)
 */
export function maskPan(pan: string): string {
  if (!pan || pan.length < 5) {
    return pan;
  }
  return pan.substring(0, 5) + 'XXXX';
}
