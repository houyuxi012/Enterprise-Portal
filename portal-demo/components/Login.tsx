
import React, { useState } from 'react';
import { 
  Fingerprint, Lock, Mail, ArrowRight, ShieldCheck, 
  Eye, EyeOff, Loader2, Globe, Sparkles 
} from 'lucide-react';

interface LoginProps {
  onLogin: (credentials: { email: string }) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      onLogin({ email });
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-[#f3f2f1] dark:bg-[#080808] transition-colors duration-700 p-6">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-2 mica rounded-organic shadow-2xl border border-white/50 dark:border-white/5 overflow-hidden animate-in fade-in zoom-in-95 duration-1000">
        
        {/* Left Side: Branding & Visuals */}
        <div className="relative hidden lg:flex flex-col justify-between p-12 bg-slate-900 dark:bg-black overflow-hidden">
          <div className="absolute inset-0 mesh-gradient opacity-40"></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          
          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-12">
              <div className="w-10 h-10 mesh-gradient rounded-xl flex items-center justify-center text-white font-black text-xl shadow-xl shadow-blue-500/20">S</div>
              <span className="font-black text-xl text-white tracking-tighter">ShiKu Home</span>
            </div>
            
            <h1 className="text-5xl font-black text-white leading-tight tracking-tighter mb-6">
              Empowering <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Next-Gen</span> <br />
              Workplaces.
            </h1>
            <p className="text-slate-400 text-lg font-medium max-w-sm leading-relaxed">
              Experience the future of enterprise collaboration with AI-powered insights and seamless productivity tools.
            </p>
          </div>

          <div className="relative z-10 flex flex-col space-y-4">
             <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-blue-400">
                   <ShieldCheck size={24} />
                </div>
                <div>
                   <p className="text-xs font-black text-white uppercase tracking-widest">Enterprise Secure</p>
                   <p className="text-[10px] text-slate-500 font-bold">AES-256 Multi-Layer Encryption</p>
                </div>
             </div>
             <div className="flex items-center space-x-2 pt-4">
                <div className="flex -space-x-2">
                   {[1,2,3].map(i => (
                     <img key={i} src={`https://i.pravatar.cc/100?u=${i+20}`} className="w-8 h-8 rounded-full border-2 border-slate-900" />
                   ))}
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">+1,200 Active Employees</p>
             </div>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="p-8 sm:p-16 flex flex-col justify-center bg-white/20 dark:bg-transparent backdrop-blur-sm relative">
          <div className="lg:hidden flex items-center space-x-3 mb-8">
            <div className="w-8 h-8 mesh-gradient rounded-lg flex items-center justify-center text-white font-black text-lg">S</div>
            <span className="font-black text-lg text-slate-900 dark:text-white tracking-tighter">ShiKu Home</span>
          </div>

          <div className="mb-10">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2 uppercase">欢迎回来</h2>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">请使用您的企业账户登录系统</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">企业邮箱 / 工号</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <Mail size={18} />
                </div>
                <input 
                  type="text" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@shiku.com" 
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all font-medium text-sm"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">登录密码</label>
                <button type="button" className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700">忘记密码？</button>
              </div>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <Lock size={18} />
                </div>
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" 
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-12 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white transition-all font-medium text-sm"
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2 ml-1 pt-2">
               <input type="checkbox" id="remember" className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
               <label htmlFor="remember" className="text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer select-none">记住本次登录</label>
            </div>

            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full mesh-gradient py-4 rounded-2xl text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-blue-500/25 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <span>安全登录</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="mt-12">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100 dark:border-slate-800"></div></div>
              <div className="relative flex justify-center text-[8px] font-black uppercase tracking-widest"><span className="bg-white dark:bg-[#0c0c0c] px-4 text-slate-400">或使用企业单点登录</span></div>
            </div>

            <div className="mt-6 flex gap-4">
               <button className="flex-1 mica py-3 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-center space-x-2 hover:bg-white dark:hover:bg-slate-800 transition-all group">
                 <Fingerprint size={16} className="text-slate-400 group-hover:text-indigo-500 transition-colors" />
                 <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">Biometric</span>
               </button>
               <button className="flex-1 mica py-3 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-center space-x-2 hover:bg-white dark:hover:bg-slate-800 transition-all group">
                 <Globe size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                 <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">SSO Login</span>
               </button>
            </div>
          </div>

          <div className="mt-12 flex items-center justify-center space-x-4">
             <div className="flex items-center space-x-1">
                <Sparkles size={12} className="text-blue-500" />
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-300">ShiKu AI Engine v4.2</span>
             </div>
             <span className="text-slate-200">|</span>
             <a href="#" className="text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors">隐私权政策</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
