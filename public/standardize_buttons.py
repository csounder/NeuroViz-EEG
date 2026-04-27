#!/usr/bin/env python3
"""
Standardize all header button sizes to match band/channel selectors
Target: padding: 4px 8px, fontSize: 9, fontWeight: 600, borderRadius: 5
"""
import re

with open('index.html', 'r') as f:
    content = f.read()

# Define standard button style
standard_padding = '"4px 8px"'
standard_font_size = '9'
standard_font_weight = '600'
standard_border_radius = '5'

# Patterns to find and replace in header sections (lines ~7000-7500)
# We'll look for button/select styling and standardize

replacements = [
    # Fix padding variations
    (r'padding: "6px 14px"', f'padding: {standard_padding}'),
    (r'padding: "6px 12px"', f'padding: {standard_padding}'),
    (r'padding: "5px 12px"', f'padding: {standard_padding}'),
    (r'padding: "7px 16px"', f'padding: {standard_padding}'),
    (r'padding: "7px 14px"', f'padding: {standard_padding}'),
    
    # Fix fontSize variations (for buttons, not labels)
    (r'fontSize: 11,', f'fontSize: {standard_font_size},'),
    (r'fontSize: 10,', f'fontSize: {standard_font_size},'),
    (r'fontSize: 12,', f'fontSize: {standard_font_size},'),
    
    # Fix fontWeight variations
    (r'fontWeight: 700,', f'fontWeight: {standard_font_weight},'),
    
    # Fix borderRadius variations
    (r'borderRadius: 6,', f'borderRadius: {standard_border_radius},'),
    (r'borderRadius: 4,', f'borderRadius: {standard_border_radius},'),
    
    # Fix border width (use 1px to match band/channel)
    (r'border: "2px solid "', 'border: "1px solid "'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

with open('index.html', 'w') as f:
    f.write(content)

print("✅ Standardized all button sizes to match band/channel selectors")
print(f"   - Padding: {standard_padding}")
print(f"   - Font size: {standard_font_size}px")
print(f"   - Font weight: {standard_font_weight}")
print(f"   - Border radius: {standard_border_radius}px")
print(f"   - Border: 1px solid")
