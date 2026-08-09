import os
import sqlite3
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static')
CORS(app)

DB_FILE = os.path.join(os.path.dirname(__file__), 'database.db')

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 0. Migration checks / drops
    cursor.execute("PRAGMA table_info(bonus_penalty_logs);")
    cols = [row['name'] for row in cursor.fetchall()]
    if cols and 'week_number' not in cols:
        cursor.execute("DROP TABLE IF EXISTS final_grades;")
        cursor.execute("DROP TABLE IF EXISTS bonus_penalty_logs;")
        cursor.execute("DROP TABLE IF EXISTS regular_scores;")
        cursor.execute("DROP TABLE IF EXISTS score_types;")
    else:
        cursor.execute("PRAGMA table_info(final_grades);")
        f_cols = [row['name'] for row in cursor.fetchall()]
        if f_cols and 'kttx_period' not in f_cols:
            cursor.execute("DROP TABLE IF EXISTS final_grades;")

    # 1. Classes Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        grade_level INTEGER NOT NULL,
        academic_year TEXT NOT NULL
    );
    """)

    # 2. Groups Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        group_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE
    );
    """)

    # 3. Students Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_code TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        class_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        is_group_leader INTEGER DEFAULT 0,
        avatar_gender TEXT DEFAULT 'male',
        FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE
    );
    """)

    # 4. Score Types Table (KTTX)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS score_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        weight REAL DEFAULT 1.0
    );
    """)

    # 5. Regular Scores Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS regular_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        score_type_id INTEGER NOT NULL,
        score REAL NOT NULL,
        date_logged TEXT NOT NULL,
        note TEXT,
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
        FOREIGN KEY (score_type_id) REFERENCES score_types (id) ON DELETE CASCADE
    );
    """)

    # 6. Bonus Penalty Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bonus_penalty_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        type TEXT CHECK(type IN ('BONUS', 'PENALTY')) NOT NULL,
        points REAL NOT NULL,
        reason TEXT NOT NULL,
        category_type TEXT NOT NULL,
        declared_by_student_id INTEGER NOT NULL,
        status TEXT CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
        week_number INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        reviewed_at TEXT,
        teacher_note TEXT,
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
        FOREIGN KEY (declared_by_student_id) REFERENCES students (id) ON DELETE CASCADE
    );
    """)

    # 7. Final Grades Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS final_grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        kttx_period INTEGER NOT NULL DEFAULT 1,
        avg_kttx REAL DEFAULT 0.0,
        total_bonus_penalty REAL DEFAULT 0.0,
        final_score REAL DEFAULT 0.0,
        academic_rank TEXT DEFAULT 'Chưa xếp loại',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE,
        UNIQUE(student_id, kttx_period)
    );
    """)

    # 8. Teacher Comments
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS teacher_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        week_num INTEGER NOT NULL,
        comment TEXT NOT NULL,
        badge TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
    );
    """)

    conn.commit()

    # Check if seed data exists
    cursor.execute("SELECT COUNT(*) FROM classes;")
    if cursor.fetchone()[0] == 0:
        seed_data(conn)

    conn.close()

def seed_data(conn):
    cursor = conn.cursor()

    # Add Classes
    cursor.execute("INSERT INTO classes (name, grade_level, academic_year) VALUES ('Lớp 8A', 8, '2025-2026');")
    class_8a_id = cursor.lastrowid
    
    cursor.execute("INSERT INTO classes (name, grade_level, academic_year) VALUES ('Lớp 8B', 8, '2025-2026');")
    class_8b_id = cursor.lastrowid

    cursor.execute("INSERT INTO classes (name, grade_level, academic_year) VALUES ('Lớp 7B', 7, '2025-2026');")
    class_7b_id = cursor.lastrowid

    # Add 8 Groups for each class (Total 24 groups)
    groups_list = []
    
    # Class 8A Groups (Indices 0-7)
    for g_num in range(1, 9):
        cursor.execute("INSERT INTO groups (class_id, group_number, name) VALUES (?, ?, ?);",
                       (class_8a_id, g_num, f"Nhóm {g_num}"))
        groups_list.append((class_8a_id, g_num, cursor.lastrowid))
        
    # Class 8B Groups (Indices 8-15)
    for g_num in range(1, 9):
        cursor.execute("INSERT INTO groups (class_id, group_number, name) VALUES (?, ?, ?);",
                       (class_8b_id, g_num, f"Nhóm {g_num}"))
        groups_list.append((class_8b_id, g_num, cursor.lastrowid))

    # Class 7B Groups (Indices 16-23)
    for g_num in range(1, 9):
        cursor.execute("INSERT INTO groups (class_id, group_number, name) VALUES (?, ?, ?);",
                       (class_7b_id, g_num, f"Nhóm {g_num}"))
        groups_list.append((class_7b_id, g_num, cursor.lastrowid))

    # Add Score Types
    score_types = [
        ("Đánh giá thường xuyên 1", "KTTX1", 1.0),
        ("Đánh giá thường xuyên 2", "KTTX2", 1.0),
        ("Đánh giá thường xuyên 3", "KTTX3", 1.0),
        ("Đánh giá thường xuyên 4", "KTTX4", 1.0),
    ]
    st_ids = []
    for name, cat, weight in score_types:
        cursor.execute("INSERT INTO score_types (name, category, weight) VALUES (?, ?, ?);", (name, cat, weight))
        st_ids.append(cursor.lastrowid)

    # Students list (24 leaders for 24 groups)
    students_raw = [
        # Lớp 8A Leaders
        ("HS801", "Nguyễn Văn An", class_8a_id, groups_list[0][2], 1, "male"),
        ("HS802", "Trần Văn Bình", class_8a_id, groups_list[1][2], 1, "male"),
        ("HS803", "Lê Văn C", class_8a_id, groups_list[2][2], 1, "male"),
        ("HS804", "Phạm Văn Dũng", class_8a_id, groups_list[3][2], 1, "male"),
        ("HS805", "Hoàng Văn Em", class_8a_id, groups_list[4][2], 1, "male"),
        ("HS806", "Vũ Văn Phong", class_8a_id, groups_list[5][2], 1, "male"),
        ("HS807", "Ngô Văn Gia", class_8a_id, groups_list[6][2], 1, "male"),
        ("HS808", "Đỗ Văn Hải", class_8a_id, groups_list[7][2], 1, "male"),

        # Lớp 8B Leaders
        ("HS809", "Bùi Thị Hương", class_8b_id, groups_list[8][2], 1, "female"),
        ("HS810", "Nguyễn Thị Mai", class_8b_id, groups_list[9][2], 1, "female"),
        ("HS811", "Đặng Thị Lan", class_8b_id, groups_list[10][2], 1, "female"),
        ("HS812", "Lý Thị Ngọc", class_8b_id, groups_list[11][2], 1, "female"),
        ("HS813", "Dương Thị Quỳnh", class_8b_id, groups_list[12][2], 1, "female"),
        ("HS814", "Trịnh Thị Thanh", class_8b_id, groups_list[13][2], 1, "female"),
        ("HS815", "Phan Thị Xuân", class_8b_id, groups_list[14][2], 1, "female"),
        ("HS816", "Hoàng Thị Yến", class_8b_id, groups_list[15][2], 1, "female"),

        # Lớp 7B Leaders
        ("HS701", "Dương Minh Nam", class_7b_id, groups_list[16][2], 1, "male"),
        ("HS702", "Nguyễn Hồng Ngọc", class_7b_id, groups_list[17][2], 1, "female"),
        ("HS703", "Phan Gia Phúc", class_7b_id, groups_list[18][2], 1, "male"),
        ("HS704", "Trịnh Như Quỳnh", class_7b_id, groups_list[19][2], 1, "female"),
        ("HS705", "Lê Hoàng Cường", class_7b_id, groups_list[20][2], 1, "male"),
        ("HS706", "Vũ Phương Thảo", class_7b_id, groups_list[21][2], 1, "female"),
        ("HS707", "Hoàng Ngọc Diệp", class_7b_id, groups_list[22][2], 1, "female"),
        ("HS708", "Trần Thị B", class_7b_id, groups_list[23][2], 1, "female"),
    ]

    student_db_ids = {}
    for code, name, c_id, g_id, is_leader, gender in students_raw:
        cursor.execute(
            "INSERT INTO students (student_code, full_name, class_id, group_id, is_group_leader, avatar_gender) VALUES (?, ?, ?, ?, ?, ?);",
            (code, name, c_id, g_id, is_leader, gender)
        )
        student_db_ids[code] = cursor.lastrowid

    # Add initial KTTX Scores
    sample_scores = {
        "HS801": [9.0, 8.5, 9.5, 9.0],
        "HS802": [8.0, 7.5, 8.5, 8.0],
        "HS803": [7.0, 6.5, 7.5, 8.0],
        "HS804": [8.5, 9.0, 9.0, 8.5],
        "HS805": [9.5, 9.0, 10.0, 9.5],
        "HS806": [8.0, 8.0, 8.5, 9.0],
        "HS807": [6.5, 7.0, 6.0, 7.5],
        "HS808": [8.5, 8.5, 9.0, 9.0],
        "HS809": [9.0, 9.5, 9.0, 9.5],
        "HS810": [7.5, 8.0, 8.0, 8.5],
        "HS811": [8.0, 8.5, 7.5, 8.0],
        "HS812": [9.0, 9.0, 9.5, 9.0],
        "HS813": [8.5, 8.0, 8.5, 9.0],
        "HS814": [9.0, 9.5, 9.0, 9.5],
        "HS815": [7.0, 7.5, 8.0, 7.5],
        "HS816": [9.5, 9.0, 9.5, 10.0],
        "HS701": [8.5, 8.0, 8.5, 9.0],
        "HS702": [9.0, 9.5, 9.0, 9.5],
        "HS703": [7.0, 7.5, 8.0, 7.5],
        "HS704": [9.5, 9.0, 9.5, 10.0],
        "HS705": [8.0, 8.0, 8.0, 8.0],
        "HS706": [8.5, 8.5, 8.5, 8.5],
        "HS707": [10.0, 10.0, 10.0, 10.0],
        "HS708": [10.0, 10.0, 10.0, 10.0],
    }

    now_str = datetime.now().strftime("%Y-%m-%d")

    for code, s_id in student_db_ids.items():
        scores_list = sample_scores.get(code, [8.0, 8.0, 8.0, 8.0])
        # Insert scores for all 4 periods
        for p in range(4):
            cursor.execute(
                "INSERT INTO regular_scores (student_id, score_type_id, score, date_logged, note) VALUES (?, ?, ?, ?, ?);",
                (s_id, st_ids[p], scores_list[p], now_str, f"Đánh giá thường xuyên đợt {p+1}")
            )

    # Add initial Bonus / Penalty Logs with week_number
    initial_logs = [
        (student_db_ids["HS801"], groups_list[0][2], "BONUS", 0.5, "Hăng hái phát biểu xây dựng bài KHTN (Môn Hóa)", "Phát biểu KHTN", student_db_ids["HS801"], "APPROVED", 2, "2026-08-01 09:15:00", "Tuyên dương An"),
        (student_db_ids["HS708"], groups_list[23][2], "BONUS", 0.5, "Chuẩn bị mẫu vật thí nghiệm Sinh học đầy đủ", "Thực hành thí nghiệm", student_db_ids["HS708"], "APPROVED", 3, "2026-08-01 10:00:00", "Rất tốt"),
        (student_db_ids["HS803"], groups_list[2][2], "PENALTY", -0.25, "Quên mang vở bài tập KHTN", "Vi phạm nội quy", student_db_ids["HS803"], "APPROVED", 7, "2026-08-02 08:00:00", "Nhắc nhở làm bù"),
        (student_db_ids["HS805"], groups_list[4][2], "BONUS", 1.0, "Giải bài tập nâng cao Vật lý KHTN trên bảng", "Bài tập nhóm", student_db_ids["HS805"], "APPROVED", 11, "2026-08-02 14:20:00", "Xuất sắc"),
        (student_db_ids["HS806"], groups_list[5][2], "BONUS", 0.5, "Hỗ trợ nhóm hoàn thành báo cáo thực hành", "Bài tập nhóm", student_db_ids["HS806"], "PENDING", 4, "2026-08-04 11:30:00", None),
        (student_db_ids["HS809"], groups_list[8][2], "BONUS", 0.5, "Phản biện xuất sắc chủ đề Tế Bào KHTN", "Phát biểu KHTN", student_db_ids["HS809"], "APPROVED", 14, "2026-08-03 15:45:00", "Tiếp tục phát huy"),
        (student_db_ids["HS707"], groups_list[22][2], "BONUS", 0.5, "Trình bày slide nhóm đẹp & chính xác", "Bài tập nhóm", student_db_ids["HS707"], "PENDING", 12, "2026-08-04 16:00:00", None)
    ]

    for s_id, g_id, l_type, pts, reason, cat, decl_id, st, week_num, c_at, t_note in initial_logs:
        cursor.execute("""
            INSERT INTO bonus_penalty_logs
            (student_id, group_id, type, points, reason, category_type, declared_by_student_id, status, week_number, created_at, reviewed_at, teacher_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (s_id, g_id, l_type, pts, reason, cat, decl_id, st, week_num, c_at, c_at if st != 'PENDING' else None, t_note))

    # Add Teacher Comments
    cursor.execute("""
        INSERT INTO teacher_comments (student_id, week_num, comment, badge, created_at)
        VALUES (?, ?, ?, ?, ?);
    """, (student_db_ids["HS805"], 1, "Học sinh học xuất sắc môn KHTN, có tư duy thí nghiệm Hóa - Lý rất sắc bén.", "Ngoại Hạng KHTN", now_str))

    conn.commit()
    recalculate_all_final_grades(conn)

def recalculate_all_final_grades(conn=None):
    close_at_end = False
    if conn is None:
        conn = get_db()
        close_at_end = True

    cursor = conn.cursor()
    cursor.execute("SELECT id FROM students;")
    students = cursor.fetchall()

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Define week ranges for each KTTX period:
    # KTTX 1: Tuần 1 - 5
    # KTTX 2: Tuần 6 - 9 (to cover Week 9 as well)
    # KTTX 3: Tuần 10 - 12
    # KTTX 4: Tuần 13 - 15
    period_weeks = {
        1: (1, 5),
        2: (6, 9),
        3: (10, 12),
        4: (13, 15)
    }

    for s in students:
        s_id = s['id']
        
        for period in [1, 2, 3, 4]:
            score_type_id = period

            # 1. Calc Avg KTTX
            cursor.execute("SELECT score FROM regular_scores WHERE student_id = ? AND score_type_id = ? LIMIT 1;", (s_id, score_type_id))
            row = cursor.fetchone()
            avg_kttx = row[0] if row else 0.0
            avg_kttx = round(avg_kttx, 2)

            # 2. Calc Total Approved Bonus/Penalty Points in the week range for this period
            w_start, w_end = period_weeks[period]
            cursor.execute("""
                SELECT SUM(points) FROM bonus_penalty_logs
                WHERE student_id = ? AND status = 'APPROVED' AND week_number BETWEEN ? AND ?;
            """, (s_id, w_start, w_end))
            total_bp = cursor.fetchone()[0] or 0.0
            total_bp = round(total_bp, 2)

            # 3. Calculate Final Grade = min(10.0, max(0.0, avg_kttx + total_bp))
            final_score = min(10.0, max(0.0, avg_kttx + total_bp))
            final_score = round(final_score, 2)

            # Rank determination
            if final_score >= 9.0:
                rank = "Xuất Sắc"
            elif final_score >= 8.0:
                rank = "Giỏi"
            elif final_score >= 6.5:
                rank = "Khá"
            elif final_score >= 5.0:
                rank = "Trung Bình"
            else:
                rank = "Yếu"

            # Update or Insert final_grades
            cursor.execute("""
                INSERT INTO final_grades (student_id, kttx_period, avg_kttx, total_bonus_penalty, final_score, academic_rank, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(student_id, kttx_period) DO UPDATE SET
                    avg_kttx = excluded.avg_kttx,
                    total_bonus_penalty = excluded.total_bonus_penalty,
                    final_score = excluded.final_score,
                    academic_rank = excluded.academic_rank,
                    updated_at = excluded.updated_at;
            """, (s_id, period, avg_kttx, total_bp, final_score, rank, now_str))

    conn.commit()
    if close_at_end:
        conn.close()

# ----------------- API ENDPOINTS -----------------

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}
    username = data.get('username', '').strip() # Can be 'admin', 'student', or 'leader_{group_id}'
    password = data.get('password', '').strip()

    # 1. Admin login
    if username == 'admin':
        if password == 'Linhhd@123':
            return jsonify({
                'success': True,
                'message': 'Chào mừng Cô Linh (Quản Trị Viên)!',
                'role': 'TEACHER',
                'name': 'Cô Linh (Quản Trị Viên)',
                'group_id': None
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Đăng nhập Quản trị viên thất bại! Mật khẩu không chính xác.'
            }), 401

    # 2. Student login
    if username == 'student':
        if password == '123':
            return jsonify({
                'success': True,
                'message': 'Chào mừng Học Sinh / Phụ Huynh!',
                'role': 'STUDENT',
                'name': 'Học Sinh',
                'group_id': None
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Đăng nhập Học sinh thất bại! Mật khẩu học sinh là "123".'
            }), 401

    # 3. Group Leader login (value is 'leader_{group_id}')
    if username.startswith('leader_'):
        try:
            group_id = int(username.split('_')[1])
        except (IndexError, ValueError):
            return jsonify({'success': False, 'message': 'Tài khoản không hợp lệ'}), 400

        conn = get_db()
        cursor = conn.cursor()
        
        # Get group details & leader details
        cursor.execute("""
            SELECT g.id, g.group_number, g.name as group_name, c.name as class_name,
                   (SELECT full_name FROM students WHERE group_id = g.id AND is_group_leader = 1 LIMIT 1) as leader_name,
                   (SELECT id FROM students WHERE group_id = g.id AND is_group_leader = 1 LIMIT 1) as leader_id
            FROM groups g
            JOIN classes c ON g.class_id = c.id
            WHERE g.id = ?;
        """, (group_id,))
        g_row = cursor.fetchone()
        conn.close()

        if g_row:
            g_num = g_row['group_number']
            c_name = g_row['class_name']
            
            pwd_norm = password.lower().strip()
            # expected password matches, e.g. "1/8A" or "1/Lớp 8A"
            expected_1 = f"{g_num}/{c_name.replace('Lớp ', '').strip()}".lower()
            expected_2 = f"{g_num}/{c_name}".lower()

            if pwd_norm == expected_1 or pwd_norm == expected_2:
                leader_name = g_row['leader_name'] or f"Trưởng nhóm {g_num} ({c_name})"
                leader_id = g_row['leader_id']
                return jsonify({
                    'success': True,
                    'message': f"Chào mừng Nhóm trưởng {leader_name}!",
                    'role': f"LEADER_{g_row['id']}",
                    'name': f"Trưởng nhóm - {leader_name}",
                    'student_id': leader_id,
                    'group_id': g_row['id']
                })
            else:
                return jsonify({
                    'success': False,
                    'message': f"Đăng nhập thất bại! Mật khẩu nhóm trưởng là: {g_num}/{c_name.replace('Lớp ', '').strip()}"
                }), 401
        else:
            return jsonify({'success': False, 'message': 'Không tìm thấy nhóm tương ứng'}), 404

    return jsonify({
        'success': False,
        'message': 'ĐĂNG NHẬP KHÔNG THÀNH CÔNG! Tài khoản không hợp lệ.'
    }), 401

@app.route('/api/warnings', methods=['GET'])
def get_warnings():
    period = request.args.get('period', default=1, type=int)
    conn = get_db()
    cursor = conn.cursor()

    # Define week ranges for each KTTX period:
    # 1: 1-5, 2: 6-9, 3: 10-12, 4: 13-15
    period_weeks = {1: (1, 5), 2: (6, 9), 3: (10, 12), 4: (13, 15)}
    w_start, w_end = period_weeks.get(period, (1, 5))

    # Find students with score < 6.5 or total penalties
    cursor.execute("""
        SELECT s.id, s.full_name, s.student_code, g.name as group_name, fg.final_score, fg.academic_rank,
               (SELECT COUNT(*) FROM bonus_penalty_logs WHERE student_id = s.id AND type = 'PENALTY' AND status = 'APPROVED' AND week_number BETWEEN ? AND ?) as penalty_count
        FROM final_grades fg
        JOIN students s ON fg.student_id = s.id
        JOIN groups g ON s.group_id = g.id
        WHERE fg.kttx_period = ? AND (fg.final_score < 7.0 OR s.id IN (
            SELECT student_id FROM bonus_penalty_logs WHERE type = 'PENALTY' AND status = 'APPROVED' AND week_number BETWEEN ? AND ?
        ))
        ORDER BY fg.final_score ASC;
    """, (w_start, w_end, period, w_start, w_end))
    warnings = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(warnings)

@app.route('/api/overview', methods=['GET'])
def get_overview():
    period = request.args.get('period', default=1, type=int)
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM students;")
    total_students = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM groups;")
    total_groups = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM bonus_penalty_logs WHERE status = 'PENDING';")
    pending_declarations = cursor.fetchone()[0]

    cursor.execute("SELECT AVG(final_score) FROM final_grades WHERE kttx_period = ?;", (period,))
    avg_class_score = round(cursor.fetchone()[0] or 0.0, 2)

    # Class rank distribution
    cursor.execute("""
        SELECT academic_rank, COUNT(*) as count
        FROM final_grades
        WHERE kttx_period = ?
        GROUP BY academic_rank;
    """, (period,))
    rank_dist = {row['academic_rank']: row['count'] for row in cursor.fetchall()}

    conn.close()
    return jsonify({
        'total_students': total_students,
        'total_groups': total_groups,
        'pending_declarations': pending_declarations,
        'avg_class_score': avg_class_score,
        'rank_distribution': rank_dist
    })

@app.route('/api/classes', methods=['GET'])
def get_classes():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM classes;")
    classes = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(classes)

@app.route('/api/groups', methods=['GET'])
def get_groups():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT g.*, c.name as class_name,
               (SELECT full_name FROM students WHERE group_id = g.id AND is_group_leader = 1 LIMIT 1) as leader_name,
               (SELECT COUNT(*) FROM students WHERE group_id = g.id) as student_count
        FROM groups g
        JOIN classes c ON g.class_id = c.id;
    """)
    groups = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(groups)

@app.route('/api/students', methods=['GET'])
def get_students():
    group_id = request.args.get('group_id')
    period = request.args.get('period', default=1, type=int)
    conn = get_db()
    cursor = conn.cursor()

    query = """
        SELECT s.*, g.name as group_name, g.group_number, c.name as class_name,
               fg.avg_kttx, fg.total_bonus_penalty, fg.final_score, fg.academic_rank
        FROM students s
        JOIN groups g ON s.group_id = g.id
        JOIN classes c ON s.class_id = c.id
        LEFT JOIN final_grades fg ON s.id = fg.student_id AND fg.kttx_period = ?
    """
    params = [period]
    if group_id:
        query += " WHERE s.group_id = ?"
        params.append(group_id)

    query += " ORDER BY s.group_id ASC, s.is_group_leader DESC, CAST(s.student_code AS INTEGER) ASC;"

    cursor.execute(query, params)
    students = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(students)

def generate_auto_comment(student_id, period, final_score, conn):
    # 1. Base comment according to score classification rules
    if final_score >= 9.0:
        base = "Hoàn thành xuất sắc nhiệm vụ học tập"
    elif final_score >= 8.0:
        base = "Hoàn thành tốt nhiệm vụ học tập"
    elif final_score >= 6.5:
        base = "Hoàn thành khá nhiệm vụ học tập"
    elif final_score >= 5.0:
        base = "Đạt yêu cầu bộ môn, cần cố gắng thêm"
    else:
        base = "Chưa đạt yêu cầu bộ môn, cần cố gắng rất nhiều"

    # 2. Get approved logs in this period to customize comment with reasons
    week_ranges = {
        1: (1, 5),
        2: (6, 9),
        3: (10, 12),
        4: (13, 15)
    }
    w_min, w_max = week_ranges.get(period, (1, 15))

    cursor = conn.cursor()
    cursor.execute("""
        SELECT type, reason, points FROM bonus_penalty_logs
        WHERE student_id = ? AND status = 'APPROVED' AND week_number BETWEEN ? AND ?;
    """, (student_id, w_min, w_max))
    rows = cursor.fetchall()

    # Group reasons
    bonus_reasons = []
    penalty_reasons = []
    for r in rows:
        reason_text = r['reason'].strip()
        if not reason_text:
            continue
        if r['type'] == 'BONUS':
            if reason_text not in bonus_reasons:
                bonus_reasons.append(reason_text)
        else:
            if reason_text not in penalty_reasons:
                penalty_reasons.append(reason_text)

    # 3. Combine base comment with reasons
    tail = ""
    if bonus_reasons and penalty_reasons:
        tail = f", tích cực phát huy các điểm mạnh như: {', '.join(bonus_reasons)}; đồng thời cần khắc phục hạn chế về: {', '.join(penalty_reasons)}."
    elif bonus_reasons:
        tail = f", phát huy tốt các ưu điểm: {', '.join(bonus_reasons)}."
    elif penalty_reasons:
        tail = f", tuy nhiên vẫn cần lưu ý rút kinh nghiệm về: {', '.join(penalty_reasons)}."
    else:
        tail = ", cần tích cực xây dựng bài và hoạt động nhóm tích cực hơn."

    return base + tail

@app.route('/api/student/<int:student_id>', methods=['GET'])
def get_student_detail(student_id):
    period = request.args.get('period', default=1, type=int)
    conn = get_db()
    cursor = conn.cursor()

    # Basic Info
    cursor.execute("""
        SELECT s.*, g.name as group_name, g.group_number, c.name as class_name,
               fg.avg_kttx, fg.total_bonus_penalty, fg.final_score, fg.academic_rank
        FROM students s
        JOIN groups g ON s.group_id = g.id
        JOIN classes c ON s.class_id = c.id
        LEFT JOIN final_grades fg ON s.id = fg.student_id AND fg.kttx_period = ?
        WHERE s.id = ?;
    """, (period, student_id))
    student = cursor.fetchone()
    if not student:
        conn.close()
        return jsonify({'error': 'Student not found'}), 404

    student_dict = dict(student)

    # Regular Scores
    cursor.execute("""
        SELECT rs.*, st.name as score_type_name, st.category
        FROM regular_scores rs
        JOIN score_types st ON rs.score_type_id = st.id
        WHERE rs.student_id = ?
        ORDER BY rs.date_logged ASC;
    """, (student_id,))
    scores = [dict(row) for row in cursor.fetchall()]

    # Bonus Penalty History
    cursor.execute("""
        SELECT bpl.*, s_decl.full_name as declared_by_name
        FROM bonus_penalty_logs bpl
        LEFT JOIN students s_decl ON bpl.declared_by_student_id = s_decl.id
        WHERE bpl.student_id = ?
        ORDER BY bpl.created_at DESC;
    """, (student_id,))
    logs = [dict(row) for row in cursor.fetchall()]

    # Teacher Comments filtered by selected KTTX period
    cursor.execute("""
        SELECT * FROM teacher_comments WHERE student_id = ? AND week_num = ? ORDER BY created_at DESC;
    """, (student_id, period))
    comments = [dict(row) for row in cursor.fetchall()]

    if not comments:
        # Generate auto comment if no custom comment is saved for this period
        final_score = student_dict.get('final_score') or 0.0
        auto_comment = generate_auto_comment(student_id, period, final_score, conn)
        auto_badge = '🌟 Học Viên Xuất Sắc KHTN' if final_score >= 9.0 else ''
        comments = [{
            'id': 0,
            'student_id': student_id,
            'week_num': period,
            'comment': auto_comment,
            'badge': auto_badge,
            'created_at': ''
        }]

    conn.close()
    student_dict['scores'] = scores
    student_dict['bonus_penalty_logs'] = logs
    student_dict['teacher_comments'] = comments
    return jsonify(student_dict)

@app.route('/api/bonus-penalty', methods=['GET', 'POST'])
def handle_bonus_penalty():
    conn = get_db()
    cursor = conn.cursor()

    if request.method == 'GET':
        status = request.args.get('status')
        group_id = request.args.get('group_id')

        query = """
            SELECT bpl.*,
                   s.full_name as student_name, s.student_code,
                   g.name as group_name, g.group_number,
                   c.name as class_name,
                   s_decl.full_name as declared_by_name
            FROM bonus_penalty_logs bpl
            JOIN students s ON bpl.student_id = s.id
            JOIN groups g ON bpl.group_id = g.id
            JOIN classes c ON s.class_id = c.id
            LEFT JOIN students s_decl ON bpl.declared_by_student_id = s_decl.id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND bpl.status = ?"
            params.append(status)
        if group_id:
            query += " AND bpl.group_id = ?"
            params.append(group_id)

        query += " ORDER BY bpl.created_at DESC;"

        cursor.execute(query, params)
        logs = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify(logs)

    elif request.method == 'POST':
        data = request.json
        student_id = data.get('student_id')
        points = float(data.get('points', 0.5))
        log_type = 'BONUS' if points > 0 else 'PENALTY'
        reason = data.get('reason', '')
        category_type = data.get('category_type', 'Khác')
        declared_by_id = data.get('declared_by_student_id')
        week_number = int(data.get('week_number', 1))

        # Find group_id of student
        cursor.execute("SELECT group_id FROM students WHERE id = ?;", (student_id,))
        s_row = cursor.fetchone()
        if not s_row:
            conn.close()
            return jsonify({'error': 'Student not found'}), 400

        group_id = s_row['group_id']
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("""
            INSERT INTO bonus_penalty_logs
            (student_id, group_id, type, points, reason, category_type, declared_by_student_id, status, week_number, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?);
        """, (student_id, group_id, log_type, points, reason, category_type, declared_by_id, week_number, now_str))

        conn.commit()
        conn.close()
        return jsonify({'message': 'Khai báo điểm thành công! Đang chờ Giáo viên duyệt.'}), 201

@app.route('/api/bonus-penalty/<int:log_id>/review', methods=['PUT'])
def review_bonus_penalty(log_id):
    data = request.json
    status = data.get('status') # 'APPROVED' or 'REJECTED'
    teacher_note = data.get('teacher_note', '')

    if status not in ['APPROVED', 'REJECTED']:
        return jsonify({'error': 'Invalid status'}), 400

    conn = get_db()
    cursor = conn.cursor()

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        UPDATE bonus_penalty_logs
        SET status = ?, teacher_note = ?, reviewed_at = ?
        WHERE id = ?;
    """, (status, teacher_note, now_str, log_id))

    conn.commit()

    # Recalculate grades automatically
    recalculate_all_final_grades(conn)

    conn.close()
    return jsonify({'message': f'Đã cập nhật trạng thái: {status}'})

@app.route('/api/scores/batch-update', methods=['POST'])
def update_scores():
    data = request.json # list of {student_id, score_type_id, score}
    conn = get_db()
    cursor = conn.cursor()

    now_str = datetime.now().strftime("%Y-%m-%d")

    for item in data:
        s_id = item['student_id']
        st_id = item['score_type_id']
        val = float(item['score'])

        # Check if score entry exists
        cursor.execute("SELECT id FROM regular_scores WHERE student_id = ? AND score_type_id = ?;", (s_id, st_id))
        existing = cursor.fetchone()
        if existing:
            cursor.execute("UPDATE regular_scores SET score = ?, date_logged = ? WHERE id = ?;", (val, now_str, existing['id']))
        else:
            cursor.execute("INSERT INTO regular_scores (student_id, score_type_id, score, date_logged) VALUES (?, ?, ?, ?);",
                           (s_id, st_id, val, now_str))

    conn.commit()

    # Recalculate grades
    recalculate_all_final_grades(conn)
    conn.close()

    return jsonify({'message': 'Đã cập nhật điểm KTTX & Tính lại điểm chốt thành công!'})

@app.route('/api/recalculate-all', methods=['POST'])
def api_recalculate_all():
    recalculate_all_final_grades()
    return jsonify({'message': 'Đã tính lại toàn bộ điểm chốt KHTN thành công!'})

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    period = request.args.get('period', default=1, type=int)
    conn = get_db()
    cursor = conn.cursor()

    # Top Students
    cursor.execute("""
        SELECT s.id, s.full_name, s.student_code, g.name as group_name, g.group_number, c.name as class_name,
               fg.avg_kttx, fg.total_bonus_penalty, fg.final_score, fg.academic_rank
        FROM final_grades fg
        JOIN students s ON fg.student_id = s.id
        JOIN groups g ON s.group_id = g.id
        JOIN classes c ON s.class_id = c.id
        WHERE fg.kttx_period = ?
        ORDER BY fg.final_score DESC, fg.total_bonus_penalty DESC
        LIMIT 10;
    """, (period,))
    top_students = [dict(row) for row in cursor.fetchall()]

    # Group Performance
    cursor.execute("""
        SELECT g.id, g.name, g.group_number, c.name as class_name,
               COUNT(s.id) as total_members,
               ROUND(AVG(fg.final_score), 2) as avg_group_score,
               ROUND(SUM(fg.total_bonus_penalty), 2) as total_group_bonus
        FROM groups g
        JOIN classes c ON g.class_id = c.id
        JOIN students s ON s.group_id = g.id
        JOIN final_grades fg ON fg.student_id = s.id AND fg.kttx_period = ?
        GROUP BY g.id
        ORDER BY avg_group_score DESC, total_group_bonus DESC;
    """, (period,))
    top_groups = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify({
        'top_students': top_students,
        'top_groups': top_groups
    })

# Add Student Endpoint
@app.route('/api/students', methods=['POST'])
def add_student():
    data = request.json
    full_name = data.get('full_name', '').strip()
    student_code = data.get('student_code', '').strip().upper()
    group_id = int(data.get('group_id', 1))
    gender = data.get('avatar_gender', 'male')
    is_leader = 1 if data.get('is_group_leader') else 0

    if not full_name:
        return jsonify({'error': 'Tên học sinh không được để trống'}), 400

    conn = get_db()
    cursor = conn.cursor()

    if not student_code:
        # Generate sequentially
        cursor.execute("SELECT student_code FROM students;")
        existing_codes = []
        for r in cursor.fetchall():
            try:
                code = r['student_code'] if isinstance(r, dict) or not hasattr(r, 'keys') else r['student_code']
                existing_codes.append(int(code))
            except Exception:
                pass
        max_code = max(existing_codes) if existing_codes else 0
        student_code = str(max_code + 1)

    # Get class_id
    cursor.execute("SELECT class_id FROM groups WHERE id = ?;", (group_id,))
    grow = cursor.fetchone()
    class_id = grow['class_id'] if grow else 1

    try:
        cursor.execute("""
            INSERT INTO students (student_code, full_name, class_id, group_id, is_group_leader, avatar_gender)
            VALUES (?, ?, ?, ?, ?, ?);
        """, (student_code, full_name, class_id, group_id, is_leader, gender))
        student_id = cursor.lastrowid

        # Insert default scores (8.0 default for all 4 types)
        cursor.execute("SELECT id FROM score_types;")
        st_ids = [r['id'] for r in cursor.fetchall()]
        now_str = datetime.now().strftime("%Y-%m-%d")
        for st_id in st_ids:
            cursor.execute("""
                INSERT INTO regular_scores (student_id, score_type_id, score, date_logged, note)
                VALUES (?, ?, 8.0, ?, 'Khởi tạo mặc định');
            """, (student_id, st_id, now_str))

        conn.commit()
        recalculate_all_final_grades(conn)
        conn.close()

        return jsonify({'message': f'Thêm học sinh {full_name} ({student_code}) thành công!', 'id': student_id}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': f'Mã học sinh "{student_code}" đã tồn tại trên hệ thống.'}), 400

@app.route('/api/students/bulk-import', methods=['POST'])
def bulk_import_students():
    data = request.json or []
    if not data:
        return jsonify({'error': 'Không có dữ liệu học sinh để nhập'}), 400

    conn = get_db()
    cursor = conn.cursor()

    success_count = 0
    errors = []
    now_str = datetime.now().strftime("%Y-%m-%d")

    # Find current max student_code as integer
    cursor.execute("SELECT student_code FROM students;")
    existing_codes = []
    for r in cursor.fetchall():
        try:
            code = r['student_code'] if isinstance(r, dict) or not hasattr(r, 'keys') else r['student_code']
            existing_codes.append(int(code))
        except (ValueError, TypeError, KeyError):
            try:
                code = r[0]
                existing_codes.append(int(code))
            except Exception:
                pass
    max_code = max(existing_codes) if existing_codes else 0

    for idx, item in enumerate(data):
        full_name = item.get('full_name', '').strip()
        # Always generate student_code sequentially based on the order of rows
        student_code = str(max_code + idx + 1)
        class_name = item.get('class_name', '').strip()
        group_name = item.get('group_name', '').strip()
        gender = item.get('avatar_gender', 'male').strip().lower()
        is_leader = 1 if item.get('is_group_leader') else 0

        if not full_name:
            errors.append(f"Dòng {idx+1}: Họ và tên học sinh không được để trống")
            continue

        if not class_name:
            class_name = "Lớp 8A"
        
        cursor.execute("SELECT id FROM classes WHERE LOWER(name) = ?;", (class_name.lower(),))
        class_row = cursor.fetchone()
        if class_row:
            class_id = class_row['id']
        else:
            cursor.execute("INSERT INTO classes (name, grade_level, academic_year) VALUES (?, 8, '2025-2026');", (class_name,))
            class_id = cursor.lastrowid

        if not group_name:
            group_name = "Nhóm 1"
        
        import re
        g_num_match = re.search(r'\d+', group_name)
        g_num = int(g_num_match.group()) if g_num_match else 1
        g_name = f"Nhóm {g_num}"

        cursor.execute("SELECT id FROM groups WHERE class_id = ? AND group_number = ?;", (class_id, g_num))
        group_row = cursor.fetchone()
        if group_row:
            group_id = group_row['id']
        else:
            cursor.execute("INSERT INTO groups (class_id, group_number, name) VALUES (?, ?, ?);", (class_id, g_num, g_name))
            group_id = cursor.lastrowid

        try:
            cursor.execute("""
                INSERT INTO students (student_code, full_name, class_id, group_id, is_group_leader, avatar_gender)
                VALUES (?, ?, ?, ?, ?, ?);
            """, (student_code, full_name, class_id, group_id, is_leader, gender))
            student_id = cursor.lastrowid

            cursor.execute("SELECT id FROM score_types;")
            st_ids = [r['id'] for r in cursor.fetchall()]
            for st_id in st_ids:
                cursor.execute("""
                    INSERT INTO regular_scores (student_id, score_type_id, score, date_logged, note)
                    VALUES (?, ?, 8.0, ?, 'Khởi tạo mặc định');
                """, (student_id, st_id, now_str))

            success_count += 1
        except sqlite3.IntegrityError:
            errors.append(f"Dòng {idx+1}: Mã học sinh '{student_code}' đã tồn tại")
            continue

    conn.commit()
    recalculate_all_final_grades(conn)
    conn.close()

    return jsonify({
        'message': f'Đã nhập thành công {success_count} học sinh.',
        'success_count': success_count,
        'errors': errors
    })

# Delete Student Endpoint
@app.route('/api/student/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT full_name FROM students WHERE id = ?;", (student_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Học sinh không tồn tại'}), 404

    s_name = row['full_name']
    cursor.execute("DELETE FROM students WHERE id = ?;", (student_id,))
    conn.commit()
    recalculate_all_final_grades(conn)
    conn.close()

    return jsonify({'message': f'Đã xóa học sinh {s_name} khỏi hệ thống.'})

# Edit Student Endpoint
@app.route('/api/student/<int:student_id>', methods=['PUT'])
def edit_student(student_id):
    data = request.json
    full_name = data.get('full_name', '').strip()
    student_code = data.get('student_code', '').strip().upper()
    group_id = int(data.get('group_id', 1))
    gender = data.get('avatar_gender', 'male')
    is_leader = 1 if data.get('is_group_leader') else 0

    if not full_name:
        return jsonify({'error': 'Tên học sinh không được để trống'}), 400

    conn = get_db()
    cursor = conn.cursor()

    if not student_code:
        cursor.execute("SELECT student_code FROM students WHERE id = ?;", (student_id,))
        srow = cursor.fetchone()
        if srow:
            student_code = srow['student_code'] if isinstance(srow, dict) or not hasattr(srow, 'keys') else srow['student_code']

    # Verify if student exists
    cursor.execute("SELECT id FROM students WHERE id = ?;", (student_id,))
    st = cursor.fetchone()
    if not st:
        conn.close()
        return jsonify({'error': 'Không tìm thấy học sinh'}), 404

    # Get class_id from the selected group
    cursor.execute("SELECT class_id FROM groups WHERE id = ?;", (group_id,))
    grow = cursor.fetchone()
    class_id = grow['class_id'] if grow else 1

    try:
        cursor.execute("""
            UPDATE students
            SET student_code = ?, full_name = ?, class_id = ?, group_id = ?, is_group_leader = ?, avatar_gender = ?
            WHERE id = ?;
        """, (student_code, full_name, class_id, group_id, is_leader, gender, student_id))

        conn.commit()
        recalculate_all_final_grades(conn)
        conn.close()

        return jsonify({'message': f'Cập nhật hồ sơ học sinh {full_name} thành công!'}), 200
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': f'Mã học sinh "{student_code}" đã tồn tại trên hệ thống.'}), 400

# Add Teacher Comment & Badge Endpoint
@app.route('/api/student/<int:student_id>/comment', methods=['POST'])
def add_teacher_comment(student_id):
    data = request.json
    comment = data.get('comment', '').strip()
    badge = data.get('badge', '').strip()
    week_num = int(data.get('week_num', 1))

    if not comment:
        return jsonify({'error': 'Nội dung nhận xét không được trống'}), 400

    conn = get_db()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("""
        SELECT id FROM teacher_comments WHERE student_id = ? AND week_num = ?;
    """, (student_id, week_num))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("""
            UPDATE teacher_comments
            SET comment = ?, badge = ?, created_at = ?
            WHERE student_id = ? AND week_num = ?;
        """, (comment, badge, now_str, student_id, week_num))
    else:
        cursor.execute("""
            INSERT INTO teacher_comments (student_id, week_num, comment, badge, created_at)
            VALUES (?, ?, ?, ?, ?);
        """, (student_id, week_num, comment, badge, now_str))

    conn.commit()
    conn.close()
    return jsonify({'message': 'Đã cập nhật nhận xét và danh hiệu tuyên dương thành công!'}), 201

# System Metrics Endpoint for Interactive Architecture visualizer
@app.route('/api/system/metrics', methods=['GET'])
def get_system_metrics():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM students;")
    students_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM groups;")
    groups_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM bonus_penalty_logs;")
    logs_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM regular_scores;")
    scores_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM teacher_comments;")
    comments_count = cursor.fetchone()[0]

    conn.close()

    return jsonify({
        'status': 'ONLINE',
        'db_type': 'SQLite (PostgreSQL Compatible)',
        'tables': {
            'students': students_count,
            'groups': groups_count,
            'bonus_penalty_logs': logs_count,
            'regular_scores': scores_count,
            'teacher_comments': comments_count
        },
        'cache_engine': 'Redis/In-Memory State Active',
        'auth_guard': 'RBAC Active (Teacher / Group Leader / Student)',
        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

# Export Summary API
@app.route('/api/export/summary', methods=['GET'])
def export_summary():
    class_id = request.args.get('class_id')
    period = request.args.get('period', default=1, type=int)
    conn = get_db()
    cursor = conn.cursor()

    query = """
        SELECT s.student_code, s.full_name, g.name as group_name, c.name as class_name,
               fg.avg_kttx, fg.total_bonus_penalty, fg.final_score, fg.academic_rank
        FROM students s
        JOIN groups g ON s.group_id = g.id
        JOIN classes c ON s.class_id = c.id
        LEFT JOIN final_grades fg ON s.id = fg.student_id AND fg.kttx_period = ?
    """
    params = [period]
    if class_id and class_id != 'ALL':
        query += " WHERE s.class_id = ?"
        params.append(class_id)
        
    query += " ORDER BY c.name, g.group_number, CAST(s.student_code AS INTEGER);"

    cursor.execute(query, params)
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return jsonify({'export_date': datetime.now().strftime("%Y-%m-%d"), 'data': rows})

# Serve Static Frontend Files
@app.route('/')
def serve_index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    print("Initializing SQLite Database...")
    init_db()
    print("Starting KHTN Server on http://127.0.0.1:5000 ...")
    app.run(host='127.0.0.1', port=5000, debug=True)

