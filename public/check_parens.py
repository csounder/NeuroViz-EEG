#!/usr/bin/env python3
"""
Find parenthesis mismatches in the App function
"""
import re

with open('index.html', 'r') as f:
    lines = f.readlines()

# Find the App function start (around line 5000)
app_start = None
app_end = None
for i, line in enumerate(lines):
    if 'function App()' in line:
        app_start = i
    if app_start is not None and line.strip() == '}' and i > 12000:
        app_end = i
        break

if app_start is None:
    print("Could not find App function")
    exit(1)

if app_end is None:
    print("Could not find App function end")
    exit(1)

print(f"App function: lines {app_start+1} to {app_end+1}")

# Check parentheses balance within the App function
stack = []
for i in range(app_start, app_end + 1):
    line = lines[i]
    # Skip strings to avoid counting parens in strings
    # Simple approach: remove quoted strings
    line_cleaned = re.sub(r'"[^"]*"', '', line)
    line_cleaned = re.sub(r"'[^']*'", '', line_cleaned)
    
    for char in line_cleaned:
        if char == '(':
            stack.append(('(', i + 1))
        elif char == ')':
            if not stack:
                print(f"EXTRA CLOSING PAREN at line {i + 1}: {lines[i].rstrip()}")
                break
            stack.pop()
    
    # Show progress every 1000 lines
    if (i - app_start) % 1000 == 0:
        print(f"Line {i+1}: stack depth = {len(stack)}")

print(f"\nFinal stack depth: {len(stack)}")
if stack:
    print("UNCLOSED OPENING PARENS:")
    for paren, line_num in stack[-10:]:  # Show last 10
        print(f"  Line {line_num}: {lines[line_num-1].rstrip()}")
