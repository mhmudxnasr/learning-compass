from pathlib import Path

root = Path('/home/mahmud/visual-learn-artifacts/rebuild-20260812/business-acquisitions')
draft = root / 'companion.md'
fragment = root / 'expansion.md'
text = draft.read_text(encoding='utf-8')
addition = fragment.read_text(encoding='utf-8').strip()
marker = '\n## ما لا يثبته هذا المصدر'
if marker in text:
    text = text.replace(marker, '\n\n## مادة إضافية من منتصف المقابلة: التشغيل والتكامل والمقايضات\n\n' + addition + marker, 1)
else:
    text += '\n\n## مادة إضافية من منتصف المقابلة: التشغيل والتكامل والمقايضات\n\n' + addition + '\n'
draft.write_text(text, encoding='utf-8')
print('merged business expansion', len(text.split()), 'space-separated tokens')
