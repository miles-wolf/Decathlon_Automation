"""
Helper script to download and save the Decathlon logo.

This script provides instructions for saving the logo image from the chat.
The logo needs to be saved as 'decathlon_logo.png' in this directory.
"""

import os
from pathlib import Path

def check_logo_exists():
    """Check if the logo file exists in the correct location."""
    logo_path = Path(__file__).parent / "decathlon_logo.png"
    
    if logo_path.exists():
        print("✓ Logo file found!")
        print(f"  Location: {logo_path}")
        print(f"  Size: {logo_path.stat().st_size:,} bytes")
        return True
    else:
        print("✗ Logo file not found")
        print(f"  Expected location: {logo_path}")
        print("\nTo add the logo:")
        print("1. Right-click the Decathlon Sports Club logo in the chat")
        print("2. Select 'Save image as...'")
        print("3. Save it as 'decathlon_logo.png' in this directory:")
        print(f"   {logo_path.parent}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Decathlon Logo Setup Check")
    print("=" * 60)
    check_logo_exists()
    print("=" * 60)
