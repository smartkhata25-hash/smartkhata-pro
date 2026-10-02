import React, { useEffect, useMemo, useState } from 'react';
import { FaBackspace, FaCalculator, FaTimes } from 'react-icons/fa';

const normalize = (value = '') => String(value).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

const calculate = (source) => {
  const text = normalize(source).replace(/\s+/g, '');
  if (!text || !/[0-9)]$/.test(text)) return null;
  let index = 0;
  const number = () => {
    const start = index;
    if (text[index] === '+' || text[index] === '-') index += 1;
    while (/[0-9.]/.test(text[index] || '')) index += 1;
    const token = text.slice(start, index);
    if (!token || ['+', '-'].includes(token) || !Number.isFinite(Number(token))) throw new Error('Invalid number');
    return Number(token);
  };
  const factor = () => {
    if (text[index] === '(') {
      index += 1;
      const value = expression();
      if (text[index] !== ')') throw new Error('Missing bracket');
      index += 1;
      return value;
    }
    return number();
  };
  const term = () => {
    let value = factor();
    while (text[index] === '*' || text[index] === '/') {
      const operator = text[index++];
      const right = factor();
      if (operator === '/' && right === 0) throw new Error('Cannot divide by zero');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const expression = () => {
    let value = term();
    while (text[index] === '+' || text[index] === '-') {
      const operator = text[index++];
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  try {
    const value = expression();
    if (index !== text.length || !Number.isFinite(value)) return { error: 'Invalid calculation' };
    return { value };
  } catch (error) {
    return { error: error.message || 'Invalid calculation' };
  }
};

const formatted = (value) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 10 }).format(value);
const operators = ['+', '−', '×', '÷'];
const isOperator = (value) => operators.includes(value);

export default function UniversalCalculator({ open, onClose, moduleName = 'Application' }) {
  const [expression, setExpression] = useState('');
  const [finalized, setFinalized] = useState(false);
  const result = useMemo(() => calculate(expression), [expression]);

  const append = (value) => {
    setExpression((current) => {
      if (/^[0-9.]$/.test(value)) return finalized ? value : `${current}${value}`;
      const clean = current.trim();
      if (!clean && value !== '−') return clean;
      if (isOperator(clean.slice(-1))) return `${clean.slice(0, -1)}${value}`;
      return `${clean}${value}`;
    });
    setFinalized(false);
  };

  const backspace = () => { setExpression((current) => current.slice(0, -1)); setFinalized(false); };
  const clear = () => { setExpression(''); setFinalized(false); };
  const percent = () => {
    setExpression((current) => current.replace(/(-?\d*\.?\d+)$/, (match) => String(Number(match) / 100)));
    setFinalized(false);
  };
  const toggleSign = () => {
    setExpression((current) => current.replace(/(-?\d*\.?\d+)$/, (match) => String(Number(match) * -1)));
    setFinalized(false);
  };
  const finalize = () => {
    if (result && !result.error) { setExpression(String(result.value)); setFinalized(true); }
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (/^[0-9.]$/.test(event.key)) { event.preventDefault(); append(event.key); }
      else if (['+', '-'].includes(event.key)) { event.preventDefault(); append(event.key === '-' ? '−' : '+'); }
      else if (event.key === '*') { event.preventDefault(); append('×'); }
      else if (event.key === '/') { event.preventDefault(); append('÷'); }
      else if (event.key === '%') { event.preventDefault(); percent(); }
      else if (event.key === 'Backspace') { event.preventDefault(); backspace(); }
      else if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      else if (event.key === 'Enter' || event.key === '=') { event.preventDefault(); finalize(); }
      else if (event.key.toLowerCase() === 'c') { event.preventDefault(); clear(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  if (!open) return null;
  const buttons = [
    ['C', clear, 'bg-rose-50 text-rose-700'], ['±', toggleSign], ['%', percent], ['÷', () => append('÷'), 'bg-cyan-50 text-cyan-800'],
    ['7', () => append('7')], ['8', () => append('8')], ['9', () => append('9')], ['×', () => append('×'), 'bg-cyan-50 text-cyan-800'],
    ['4', () => append('4')], ['5', () => append('5')], ['6', () => append('6')], ['−', () => append('−'), 'bg-cyan-50 text-cyan-800'],
    ['1', () => append('1')], ['2', () => append('2')], ['3', () => append('3')], ['+', () => append('+'), 'bg-cyan-50 text-cyan-800'],
    ['0', () => append('0'), 'col-span-2'], ['.', () => append('.')], ['=', finalize, 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white'],
  ];

  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="calculator-title">
    <button type="button" className="absolute inset-0 cursor-default" aria-label="Close calculator" onClick={onClose} />
    <section className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl">
      <header className="flex items-center gap-3 bg-gradient-to-r from-slate-950 via-cyan-950 to-blue-900 px-4 py-3 text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10"><FaCalculator /></span><div className="min-w-0 flex-1"><h2 id="calculator-title" className="font-black">Calculator</h2><p className="text-[11px] font-semibold text-cyan-200">{moduleName} utility</p></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Close calculator"><FaTimes /></button></header>
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-right text-white"><div className="min-h-6 break-all text-sm font-semibold text-slate-300">{expression || '0'}</div><div className={`mt-2 min-h-11 break-all text-3xl font-black ${result?.error ? 'text-rose-300' : 'text-white'}`}>{result?.error || (result ? formatted(result.value) : '0')}</div></div>
      <div className="grid grid-cols-4 gap-2 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-4">{buttons.map(([label, action, tone = '']) => <button key={label} type="button" onClick={action} className={`h-12 rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow ${tone}`}>{label}</button>)}</div>
      <button type="button" onClick={backspace} className="flex w-full items-center justify-center gap-2 border-t border-slate-100 bg-white py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"><FaBackspace /> Backspace</button>
    </section>
  </div>;
}
