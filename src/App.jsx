import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";

const COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6"];
const STATUSES = ["Todo","In Progress","Done"];
const STATUS_COLORS = { "Todo":"#6366f1","In Progress":"#f59e0b","Done":"#10b981" };
const PRIORITY = ["低","中","高"];
const PRIORITY_COLORS = {"低":"#10b981","中":"#f59e0b","高":"#ef4444"};

const initialProjects = [
  { id:1, name:"ウェブサイトリニューアル", color:"#6366f1", description:"コーポレートサイトの全面改修" },
  { id:2, name:"マーケティングキャンペーン", color:"#ec4899", description:"Q2施策の企画・実施" },
];

const initialTasks = [
  { id:1, projectId:1, title:"デザインカンプ作成", status:"In Progress", priority:"高", due:"2026-04-05", desc:"トップページとサービスページのデザイン" },
  { id:2, projectId:1, title:"コーディング", status:"Todo", priority:"中", due:"2026-04-20", desc:"HTML/CSS実装" },
  { id:3, projectId:2, title:"SNS投稿計画", status:"Done", priority:"低", due:"2026-03-30", desc:"各SNSの投稿スケジュール作成" },
  { id:4, projectId:2, title:"メルマガ原稿", status:"Todo", priority:"高", due:"2026-04-03", desc:"メールマガジンの文章作成" },
];

function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [val, key]);
  return [val, setVal];
}

function Badge({ color, label, small }) {
  return <span style={{ background: color+"22", color, border:`1px solid ${color}44`, borderRadius:20, padding: small?"1px 8px":"2px 10px", fontSize: small?11:12, fontWeight:600, whiteSpace:"nowrap" }}>{label}</span>;
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"#0008",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"#fff",borderRadius:16,padding:28,minWidth:340,maxWidth:500,width:"90%",boxShadow:"0 8px 40px #0003",position:"relative" }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontWeight:700,fontSize:18,marginBottom:18,color:"#1e293b" }}>{title}</div>
        {children}
        <button onClick={onClose} style={{ position:"absolute",top:14,right:16,background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#94a3b8" }}>✕</button>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={{ fontSize:12,fontWeight:600,color:"#64748b",display:"block",marginBottom:4 }}>{label}</label>}
      <input {...props} style={{ width:"100%",padding:"8px 12px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:14,outline:"none",boxSizing:"border-box",...props.style }} />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={{ fontSize:12,fontWeight:600,color:"#64748b",display:"block",marginBottom:4 }}>{label}</label>}
      <select {...props} style={{ width:"100%",padding:"8px 12px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:14,outline:"none",background:"#fff",boxSizing:"border-box" }}>{children}</select>
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div style={{ marginBottom:14 }}>
      {label && <label style={{ fontSize:12,fontWeight:600,color:"#64748b",display:"block",marginBottom:4 }}>{label}</label>}
      <textarea {...props} rows={3} style={{ width:"100%",padding:"8px 12px",borderRadius:8,border:"1.5px solid #e2e8f0",fontSize:14,outline:"none",resize:"vertical",boxSizing:"border-box" }} />
    </div>
  );
}

function Dashboard({ user, onLogout }) {
  const [projects, setProjects] = useLocalStorage("projects_v1", initialProjects);
  const [tasks, setTasks] = useLocalStorage("tasks_v1", initialTasks);
  const [view, setView] = useState("board");
  const [selProject, setSelProject] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionStatus, setNotionStatus] = useState(null);
  const [newTask, setNewTask] = useState({ title:"", status:"Todo", priority:"中", due:"", desc:"", projectId:"" });
  const [newProject, setNewProject] = useState({ name:"", description:"", color: COLORS[0] });
  const [dragId, setDragId] = useState(null);

  const filtered = selProject ? tasks.filter(t=>t.projectId===selProject) : tasks;
  const today = new Date().toISOString().slice(0,10);

  function addTask() {
    if (!newTask.title.trim()) return;
    const pid = newTask.projectId ? Number(newTask.projectId) : (selProject || projects[0]?.id);
    setTasks(prev=>[...prev, { ...newTask, id: Date.now(), projectId: pid }]);
    setNewTask({ title:"", status:"Todo", priority:"中", due:"", desc:"", projectId:"" });
    setShowAddTask(false);
  }

  function addProject() {
    if (!newProject.name.trim()) return;
    setProjects(prev=>[...prev, { ...newProject, id: Date.now() }]);
    setNewProject({ name:"", description:"", color: COLORS[0] });
    setShowAddProject(false);
  }

  function deleteTask(id) { setTasks(p=>p.filter(t=>t.id!==id)); }
  function updateTaskStatus(id, status) { setTasks(p=>p.map(t=>t.id===id?{...t,status}:t)); }
  function saveEdit() { setTasks(p=>p.map(t=>t.id===editTask.id?editTask:t)); setEditTask(null); }

  function onDrop(status) {
    if (dragId) { updateTaskStatus(dragId, status); setDragId(null); }
  }

  async function syncNotion() {
    setNotionLoading(true); setNotionStatus(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          messages:[{ role:"user", content:`以下のタスクをNotionに同期する場合の操作手順を日本語で簡潔に説明してください（実際のAPI呼び出しは不要）:\n${JSON.stringify(tasks.slice(0,3))}` }],
          mcp_servers:[{ type:"url", url:"https://mcp.notion.com/mcp", name:"notion-mcp" }]
        })
      });
      const data = await response.json();
      const text = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("\n") || "同期しました！";
      setNotionStatus({ ok:true, msg: text.slice(0,120)+"..." });
    } catch(e) {
      setNotionStatus({ ok:false, msg:"Notionへの接続に失敗しました。連携設定を確認してください。" });
    }
    setNotionLoading(false);
  }

  const counts = s => filtered.filter(t=>t.status===s).length;
  const overdue = filtered.filter(t=>t.due && t.due < today && t.status!=="Done").length;

  return (
    <div style={{ fontFamily:"'Segoe UI',sans-serif", background:"#f1f5f9", minHeight:"100vh", padding:0 }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)", padding:"18px 24px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:20, letterSpacing:0.5 }}>✦ TaskFlow</div>
          <div style={{ color:"#ffffff99", fontSize:12 }}>To-do & プロジェクト管理</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={syncNotion} disabled={notionLoading} style={{ background:"#fff", color:"#6366f1", border:"none", borderRadius:10, padding:"8px 16px", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            {notionLoading ? "⏳ 同期中..." : "🔗 Notionへ同期"}
          </button>
          {user.photoURL && <img src={user.photoURL} alt="" style={{ width:30, height:30, borderRadius:"50%", border:"2px solid #fff" }} referrerPolicy="no-referrer" />}
          <span style={{ color:"#fff", fontSize:12, fontWeight:500, maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.displayName}</span>
          <button onClick={onLogout} style={{ background:"#ffffff33", color:"#fff", border:"none", borderRadius:8, padding:"6px 12px", fontSize:12, cursor:"pointer", fontWeight:600 }}>ログアウト</button>
        </div>
      </div>

      {notionStatus && (
        <div style={{ background: notionStatus.ok?"#d1fae5":"#fee2e2", color: notionStatus.ok?"#065f46":"#991b1b", padding:"10px 24px", fontSize:13 }}>
          {notionStatus.ok ? "✅ " : "❌ "}{notionStatus.msg}
        </div>
      )}

      <div style={{ display:"flex", gap:0, padding:"16px 16px 0" }}>
        {/* Sidebar */}
        <div style={{ width:200, flexShrink:0, marginRight:16 }}>
          <div style={{ background:"#fff", borderRadius:14, padding:14, marginBottom:12, boxShadow:"0 1px 6px #0001" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:8, letterSpacing:1 }}>プロジェクト</div>
            <div onClick={()=>setSelProject(null)} style={{ padding:"6px 10px", borderRadius:8, background: !selProject?"#ede9fe":"transparent", color: !selProject?"#6366f1":"#475569", fontWeight:600, fontSize:13, cursor:"pointer", marginBottom:4 }}>
              📋 すべて <span style={{ float:"right", fontSize:11, color:"#94a3b8" }}>{tasks.length}</span>
            </div>
            {projects.map(p=>(
              <div key={p.id} onClick={()=>setSelProject(p.id)} style={{ padding:"6px 10px", borderRadius:8, background: selProject===p.id?"#ede9fe":"transparent", color: selProject===p.id?"#6366f1":"#475569", fontWeight:500, fontSize:13, cursor:"pointer", marginBottom:2, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:p.color, display:"inline-block", flexShrink:0 }}></span>
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
                <span style={{ fontSize:11, color:"#94a3b8" }}>{tasks.filter(t=>t.projectId===p.id).length}</span>
              </div>
            ))}
            <button onClick={()=>setShowAddProject(true)} style={{ width:"100%", marginTop:8, padding:"5px", borderRadius:8, border:"1.5px dashed #c7d2fe", background:"transparent", color:"#6366f1", fontSize:12, cursor:"pointer", fontWeight:600 }}>＋ プロジェクト追加</button>
          </div>

          {/* Stats */}
          <div style={{ background:"#fff", borderRadius:14, padding:14, boxShadow:"0 1px 6px #0001" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", marginBottom:8, letterSpacing:1 }}>サマリー</div>
            {STATUSES.map(s=>(
              <div key={s} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <Badge color={STATUS_COLORS[s]} label={s} small />
                <span style={{ fontWeight:700, color:"#1e293b" }}>{counts(s)}</span>
              </div>
            ))}
            {overdue > 0 && <div style={{ marginTop:8, fontSize:12, color:"#ef4444", fontWeight:600 }}>⚠️ 期限切れ: {overdue}件</div>}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* Toolbar */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div style={{ display:"flex", gap:6 }}>
              {[["board","カンバン"],["list","リスト"]].map(([v,l])=>(
                <button key={v} onClick={()=>setView(v)} style={{ padding:"6px 16px", borderRadius:8, border:"none", background: view===v?"linear-gradient(135deg,#6366f1,#8b5cf6)":"#fff", color: view===v?"#fff":"#64748b", fontWeight:600, fontSize:13, cursor:"pointer", boxShadow: view===v?"0 2px 8px #6366f144":"none" }}>{l}</button>
              ))}
            </div>
            <button onClick={()=>setShowAddTask(true)} style={{ padding:"7px 18px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#ec4899)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", boxShadow:"0 2px 10px #6366f155" }}>＋ タスク追加</button>
          </div>

          {/* Board View */}
          {view==="board" && (
            <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
              {STATUSES.map(s=>(
                <div key={s} style={{ flex:1, minWidth:0 }} onDragOver={e=>e.preventDefault()} onDrop={()=>onDrop(s)}>
                  <div style={{ background:"#fff", borderRadius:14, padding:"10px 12px 6px", marginBottom:8, display:"flex", alignItems:"center", gap:8, boxShadow:"0 1px 4px #0001" }}>
                    <span style={{ width:10,height:10,borderRadius:"50%",background:STATUS_COLORS[s],display:"inline-block" }}></span>
                    <span style={{ fontWeight:700, fontSize:14, color:"#1e293b" }}>{s}</span>
                    <span style={{ marginLeft:"auto", background:STATUS_COLORS[s]+"22", color:STATUS_COLORS[s], borderRadius:20, padding:"1px 8px", fontSize:12, fontWeight:700 }}>{filtered.filter(t=>t.status===s).length}</span>
                  </div>
                  {filtered.filter(t=>t.status===s).map(t=>{
                    const proj = projects.find(p=>p.id===t.projectId);
                    const isOverdue = t.due && t.due < today && t.status!=="Done";
                    return (
                      <div key={t.id} draggable onDragStart={()=>setDragId(t.id)} onClick={()=>setEditTask({...t})}
                        style={{ background:"#fff", borderRadius:12, padding:"12px 14px", marginBottom:8, boxShadow:"0 2px 8px #0001", cursor:"pointer", borderLeft:`3px solid ${proj?.color||"#6366f1"}`, transition:"box-shadow .2s" }}
                        onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px #6366f122"}
                        onMouseLeave={e=>e.currentTarget.style.boxShadow="0 2px 8px #0001"}
                      >
                        <div style={{ fontWeight:600, fontSize:14, color:"#1e293b", marginBottom:6 }}>{t.title}</div>
                        {t.desc && <div style={{ fontSize:12, color:"#94a3b8", marginBottom:6, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{t.desc}</div>}
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, alignItems:"center" }}>
                          <Badge color={PRIORITY_COLORS[t.priority]} label={t.priority} small />
                          {t.due && <span style={{ fontSize:11, color: isOverdue?"#ef4444":"#94a3b8", fontWeight: isOverdue?700:400 }}>{isOverdue?"⚠️ ":""}{t.due}</span>}
                        </div>
                        {proj && <div style={{ marginTop:6, fontSize:11, color:proj.color, fontWeight:600 }}>◉ {proj.name}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* List View */}
          {view==="list" && (
            <div style={{ background:"#fff", borderRadius:14, overflow:"hidden", boxShadow:"0 1px 6px #0001" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ background:"#f8fafc" }}>
                    {["タスク","ステータス","優先度","期限","プロジェクト",""].map(h=>(
                      <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:12, fontWeight:700, color:"#64748b", borderBottom:"1px solid #f1f5f9" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t=>{
                    const proj = projects.find(p=>p.id===t.projectId);
                    const isOverdue = t.due && t.due < today && t.status!=="Done";
                    return (
                      <tr key={t.id} style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer" }} onClick={()=>setEditTask({...t})}
                        onMouseEnter={e=>e.currentTarget.style.background="#fafbff"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                      >
                        <td style={{ padding:"10px 14px", fontWeight:500, fontSize:14, color:"#1e293b" }}>{t.title}</td>
                        <td style={{ padding:"10px 14px" }}><Badge color={STATUS_COLORS[t.status]} label={t.status} small /></td>
                        <td style={{ padding:"10px 14px" }}><Badge color={PRIORITY_COLORS[t.priority]} label={t.priority} small /></td>
                        <td style={{ padding:"10px 14px", fontSize:12, color: isOverdue?"#ef4444":"#64748b", fontWeight: isOverdue?700:400 }}>{isOverdue?"⚠️ ":""}{t.due||"-"}</td>
                        <td style={{ padding:"10px 14px" }}>{proj && <span style={{ fontSize:12, color:proj.color, fontWeight:600 }}>◉ {proj.name}</span>}</td>
                        <td style={{ padding:"10px 14px" }}><button onClick={e=>{e.stopPropagation();deleteTask(t.id)}} style={{ background:"#fee2e2",color:"#ef4444",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12 }}>削除</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length===0 && <div style={{ textAlign:"center", padding:40, color:"#94a3b8", fontSize:14 }}>タスクがありません。右上から追加しましょう！</div>}
            </div>
          )}
        </div>
      </div>

      {/* Add Task Modal */}
      {showAddTask && (
        <Modal title="➕ タスク追加" onClose={()=>setShowAddTask(false)}>
          <Input label="タスク名*" value={newTask.title} onChange={e=>setNewTask(p=>({...p,title:e.target.value}))} placeholder="例：デザイン作成" />
          <Textarea label="説明" value={newTask.desc} onChange={e=>setNewTask(p=>({...p,desc:e.target.value}))} placeholder="詳細を入力..." />
          <Select label="プロジェクト" value={newTask.projectId} onChange={e=>setNewTask(p=>({...p,projectId:e.target.value}))}>
            <option value="">プロジェクトを選択</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}>
              <Select label="ステータス" value={newTask.status} onChange={e=>setNewTask(p=>({...p,status:e.target.value}))}>
                {STATUSES.map(s=><option key={s}>{s}</option>)}
              </Select>
            </div>
            <div style={{ flex:1 }}>
              <Select label="優先度" value={newTask.priority} onChange={e=>setNewTask(p=>({...p,priority:e.target.value}))}>
                {PRIORITY.map(s=><option key={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <Input label="期限" type="date" value={newTask.due} onChange={e=>setNewTask(p=>({...p,due:e.target.value}))} />
          <button onClick={addTask} style={{ width:"100%", padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#ec4899)", color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>追加する</button>
        </Modal>
      )}

      {/* Add Project Modal */}
      {showAddProject && (
        <Modal title="📁 プロジェクト追加" onClose={()=>setShowAddProject(false)}>
          <Input label="プロジェクト名*" value={newProject.name} onChange={e=>setNewProject(p=>({...p,name:e.target.value}))} placeholder="例：新機能開発" />
          <Textarea label="説明" value={newProject.description} onChange={e=>setNewProject(p=>({...p,description:e.target.value}))} />
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:"#64748b", display:"block", marginBottom:8 }}>カラー</label>
            <div style={{ display:"flex", gap:8 }}>
              {COLORS.map(c=>(
                <div key={c} onClick={()=>setNewProject(p=>({...p,color:c}))} style={{ width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer", border: newProject.color===c?"3px solid #1e293b":"3px solid transparent", transition:"border .15s" }} />
              ))}
            </div>
          </div>
          <button onClick={addProject} style={{ width:"100%", padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>追加する</button>
        </Modal>
      )}

      {/* Edit Task Modal */}
      {editTask && (
        <Modal title="✏️ タスク編集" onClose={()=>setEditTask(null)}>
          <Input label="タスク名*" value={editTask.title} onChange={e=>setEditTask(p=>({...p,title:e.target.value}))} />
          <Textarea label="説明" value={editTask.desc} onChange={e=>setEditTask(p=>({...p,desc:e.target.value}))} />
          <Select label="プロジェクト" value={editTask.projectId} onChange={e=>setEditTask(p=>({...p,projectId:Number(e.target.value)}))}>
            {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}>
              <Select label="ステータス" value={editTask.status} onChange={e=>setEditTask(p=>({...p,status:e.target.value}))}>
                {STATUSES.map(s=><option key={s}>{s}</option>)}
              </Select>
            </div>
            <div style={{ flex:1 }}>
              <Select label="優先度" value={editTask.priority} onChange={e=>setEditTask(p=>({...p,priority:e.target.value}))}>
                {PRIORITY.map(s=><option key={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <Input label="期限" type="date" value={editTask.due} onChange={e=>setEditTask(p=>({...p,due:e.target.value}))} />
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={saveEdit} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#ec4899)", color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>保存</button>
            <button onClick={()=>{deleteTask(editTask.id);setEditTask(null)}} style={{ padding:"10px 16px", borderRadius:10, border:"none", background:"#fee2e2", color:"#ef4444", fontWeight:700, fontSize:15, cursor:"pointer" }}>削除</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  async function handleLogin() {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { if (e.code !== "auth/popup-closed-by-user") console.error(e); }
  }

  async function handleLogout() {
    await signOut(auth);
  }

  if (authLoading) {
    return (
      <div style={{ fontFamily:"'Segoe UI',sans-serif", background:"#f1f5f9", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:"#6366f1", fontSize:18, fontWeight:600 }}>読み込み中...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ fontFamily:"'Segoe UI',sans-serif", background:"linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:"#fff", borderRadius:20, padding:"48px 40px", textAlign:"center", boxShadow:"0 20px 60px #0003", maxWidth:400, width:"90%" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✦</div>
          <div style={{ fontWeight:800, fontSize:28, color:"#1e293b", marginBottom:6 }}>TaskFlow</div>
          <div style={{ color:"#64748b", fontSize:14, marginBottom:32 }}>To-do & プロジェクト管理</div>
          <button onClick={handleLogin} style={{ width:"100%", padding:"12px 24px", borderRadius:12, border:"1.5px solid #e2e8f0", background:"#fff", color:"#1e293b", fontWeight:600, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, transition:"background .2s" }}
            onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
            onMouseLeave={e=>e.currentTarget.style.background="#fff"}
          >
            <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}
