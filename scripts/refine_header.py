import sys

filepath = 'd:/PYTHON/SPORTSPACE/src/components/Header.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
'''              className="btn flex items-center gap-2 transition-all hover:scale-105"
              style={{
                padding: '8px 18px',
                borderRadius: '9999px',
                backgroundColor: theme === 'dark' ? '#84D175' : '#89B9E6',
                color: theme === 'dark' ? '#07260F' : '#0E2841',
                fontWeight: 800,
                fontSize: '0.85rem',
                boxShadow: 'var(--shadow-sm)'
              }}''',
'''              className="btn flex items-center gap-2 transition-all hover:scale-105"
              style={{
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: theme === 'dark' ? '#84D175' : '#89B9E6',
                color: theme === 'dark' ? '#07260F' : '#0E2841',
                fontWeight: 800,
                fontSize: '0.9rem',
                boxShadow: 'var(--shadow-sm)',
                whiteSpace: 'nowrap'
              }}'''
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Header.jsx updated successfully!")
