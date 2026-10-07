import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, GraduationCap, FileText, Check, CheckCircle2, Clock, BarChart3 } from 'lucide-react';
import useDocumentTitle from '@/shared/hooks/useDocumentTitle';
import DocumentModal from '@/shared/components/DocumentModal';
import { footerDocuments } from '../content/footerContent';

export default function LandingPage() {
  useDocumentTitle('Dolphin | Dạy nhẹ nhàng. Học chủ động.');
  const [activeDoc, setActiveDoc] = useState(null);
  return (
    <div className="landing">
      <section className="landing-hero page-width">
        <div className="hero-copy">
          <span className="eyebrow"><span />KHÔNG GIAN HỌC TẬP DOLPHIN</span>
          <h1>Dạy nhẹ nhàng.<br />Học <span>chủ động.</span></h1>
          <p>Một nơi để tạo đề, làm bài và nhìn thấy sự tiến bộ. Dành thời gian cho điều quan trọng nhất: việc học.</p>
          <div className="hero-actions"><Link to="/teacher" className="button-primary">Bắt đầu tạo đề <ArrowRight size={18} /></Link><Link to="/student" className="button-secondary">Tôi là học sinh <ArrowUpRight size={18} /></Link></div>
          <div className="hero-benefits"><span><Check size={16} />Nhập đề từ Word</span><span><Check size={16} />Chấm điểm tự động</span></div>
        </div>
        <div className="hero-scene" aria-label="Minh họa quy trình tạo đề và xem kết quả">
          <div className="scene-orbit orbit-one" /><div className="scene-orbit orbit-two" />
          <div className="exam-preview">
            <div className="preview-toolbar"><span className="preview-mark"><BookOpen size={17} />Dolphin</span><span className="sample-tag">BẢN MINH HỌA</span></div>
            <div className="preview-content"><span className="eyebrow">KHÔNG GIAN GIẢNG DẠY</span><h2>Mỗi bài kiểm tra.<br />Một bước tiến mới.</h2><div className="preview-exam"><div className="subject-icon"><FileText size={23} /></div><div><strong>Ôn tập Toán học</strong><p><Clock size={13} />45 phút · 20 câu hỏi</p></div><CheckCircle2 size={19} className="preview-check" /></div><div className="preview-question"><span>Câu hỏi 01</span><p>Đạo hàm của hàm số y = x² là:</p><div className="sample-answer"><span>A</span>y′ = 2x<Check size={16} /></div><div className="sample-answer neutral"><span>B</span>y′ = x</div></div><div className="preview-bottom"><span><CheckCircle2 size={15} />Sẵn sàng cho buổi học</span><span>20 / 20 câu</span></div></div>
          </div>
          <div className="result-note"><span className="result-icon"><BarChart3 size={20} /></span><div><strong>Tiến bộ từng ngày</strong><span>Kết quả rõ ràng. Phản hồi kịp thời.</span></div></div>
        </div>
      </section>
      <section className="role-section page-width" aria-labelledby="role-title">
        <div className="section-heading"><div><span className="eyebrow">BẮT ĐẦU TỪ BẠN</span><h2 id="role-title">Không gian dành riêng cho bạn.</h2></div><p>Chọn vai trò. Bắt đầu điều bạn cần.</p></div>
        <div className="role-grid"><Link to="/teacher" className="role-card"><span className="role-icon"><BookOpen size={24} /></span><div><span className="role-kicker">DÀNH CHO GIÁO VIÊN</span><h3>Ít thao tác hơn.<br />Nhiều thời gian giảng dạy hơn.</h3><p>Tạo và nhập đề, tùy chỉnh bài thi, theo dõi bài nộp trong một không gian gọn gàng.</p><span className="role-action">Vào không gian giáo viên <ArrowRight size={18} /></span></div></Link><Link to="/student" className="role-card student-role"><span className="role-icon"><GraduationCap size={26} /></span><div><span className="role-kicker">DÀNH CHO HỌC SINH</span><h3>Tập trung làm bài.<br />Hiểu rõ kết quả của mình.</h3><p>Tham gia bằng mã đề, xem lại bài làm và theo dõi lịch sử học tập của bạn.</p><span className="role-action">Vào không gian học sinh <ArrowRight size={18} /></span></div></Link></div>
      </section>
      <section className="workflow page-width" aria-labelledby="workflow-title"><div className="section-heading"><div><span className="eyebrow">TỪ CHUẨN BỊ ĐẾN TIẾN BỘ</span><h2 id="workflow-title">Một quy trình liền mạch.</h2></div></div><div className="workflow-grid">{[{icon:FileText,title:'Tạo đề theo cách của bạn',text:'Soạn từng câu hoặc nhập từ tài liệu Word, PDF và văn bản.'},{icon:CheckCircle2,title:'Làm bài, nhận kết quả',text:'Chấm tự động câu hỏi khách quan ngay khi học sinh nộp bài.'},{icon:BarChart3,title:'Hiểu rõ từng bài làm',text:'Xem điểm số, câu trả lời và lịch sử để định hướng buổi học tiếp theo.'}].map(({icon:Icon,title,text})=><div key={title} className="workflow-item"><Icon size={23} /><h3>{title}</h3><p>{text}</p></div>)}</div></section>
      <footer className="landing-footer page-width"><Link to="/" className="brand"><span className="brand-symbol"><img src="/dolphin-logo.png" alt="" /></span><span>Dolphin</span></Link><div>{[['terms','Điều khoản'],['privacy','Bảo mật'],['guide','Hướng dẫn'],['support','Hỗ trợ']].map(([key,label])=><button key={key} onClick={()=>setActiveDoc(key)}>{label}</button>)}<a href="https://zalo.me/0328635738" target="_blank" rel="noreferrer">Liên hệ Zalo <ArrowUpRight size={14} /></a></div><span>Dạy và học, cùng Dolphin.</span></footer>
      <DocumentModal isOpen={!!activeDoc} onClose={()=>setActiveDoc(null)} title={activeDoc ? footerDocuments[activeDoc].title : ''} content={activeDoc ? footerDocuments[activeDoc].content : null} />
    </div>
  );
}
