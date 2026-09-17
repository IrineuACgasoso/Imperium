import { useState } from 'react';
import { extrairTextoPdf } from '../parsers/pdfToText.js';

export function usePdfImport() {
  const [texto, setTexto] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setCarregando(true);
    setErro(null);
    try {
      const t = await extrairTextoPdf(file);
      setTexto(t);
      setNomeArquivo(file.name);
    } catch (e) {
      setErro('Não consegui ler esse PDF: ' + e.message);
      setTexto(null);
    } finally {
      setCarregando(false);
    }
  }

  function limpar() {
    setTexto(null);
    setNomeArquivo(null);
    setErro(null);
  }

  return { texto, nomeArquivo, carregando, erro, handleFile, limpar };
}
