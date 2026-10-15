# 修复Three.js库的全局变量问题

with open('game_single.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 在Three.js库开始处添加全局THREE对象初始化
# 找到注释"THREE.js 库"后面的位置
three_start = content.find('// ═══════════════════════════════════\n//  THREE.js 库\n// ═══════════════════════════════════')
if three_start != -1:
    # 找到下一个换行后的位置
    after_comment = content.find('\n', three_start + 80) + 1
    
    # 在Three.js代码开始前添加THREE对象初始化
    insert_code = '''// 全局THREE对象初始化
let THREE = window.THREE = {};

'''
    content = content[:after_comment] + insert_code + content[after_comment:]
    
    # 写入文件
    with open('game_single.html', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("Successfully added global THREE object initialization")
else:
    print("Could not find Three.js library start")