#!/usr/bin/env python3
"""
Move band/channel selectors from display area to header ROW 3
"""

with open('index.html', 'r') as f:
    lines = f.readlines()

# Section boundaries (1-indexed, convert to 0-indexed)
header_row2_end = 7543 - 1  # Where header closes (before MAIN LAYOUT comment)
band_channel_start = 7805 - 1  # Start of band/channel selectors
band_channel_end = 7973 - 1  # End of band/channel selectors (the closing ),)

# Extract sections
before_header_end = lines[:header_row2_end]
header_close_to_selectors = lines[header_row2_end:band_channel_start]
band_channel_section = lines[band_channel_start:band_channel_end+1]
after_selectors = lines[band_channel_end+1:]

# Add ROW 3 comment before band/channel section
row3_comment = [
    "            // ───────────────────────────────────────────────────────────────\n",
    "            // ROW 3: Band & Channel Selectors\n",
    "            // ───────────────────────────────────────────────────────────────\n",
]

# Rebuild: header (with ROW 3 added) + rest
new_lines = (
    before_header_end +
    row3_comment +
    band_channel_section +
    header_close_to_selectors +
    after_selectors
)

# Update height calculation (was 140px for 2 rows, now 180px for 3 rows)
new_lines_str = ''.join(new_lines)
new_lines_str = new_lines_str.replace(
    'height: "calc(100vh - 140px)"',
    'height: "calc(100vh - 180px)"'
)

with open('index.html', 'w') as f:
    f.write(new_lines_str)

print("✅ Moved band/channel selectors to header ROW 3")
print(f"   - Extracted lines {band_channel_start+1}-{band_channel_end+1}")
print(f"   - Inserted before line {header_row2_end+1}")
print(f"   - Updated viewport height from 140px to 180px")
