import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import'./i18n';import'./style.css';import{App}from'./App';
declare global{interface Window{Telegram?:{WebApp:{initData:string;colorScheme:string;ready():void;expand():void;BackButton:{show():void;hide():void;onClick(cb:()=>void):void;offClick(cb:()=>void):void}}}}}
window.Telegram?.WebApp.ready();window.Telegram?.WebApp.expand();createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);
