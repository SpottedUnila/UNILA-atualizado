# Spotted Android

Este módulo é o wrapper Android nativo do Spotted. Ele carrega o app publicado no GitHub Pages e expõe `AndroidShare.share(text)` para o HTML.

A atividade usa `Intent.ACTION_SEND` com `Intent.createChooser`, portanto o Android lista os aplicativos instalados que aceitam texto, como WhatsApp, Facebook, Facebook Lite, Instagram, Bluetooth e Quick Share.

## Compilação

Abra esta pasta no Android Studio e execute **Build > Build APK(s)**. O APK gerado ficará em `app/build/outputs/apk/debug/app-debug.apk` para uma compilação de teste.

Para uma versão de produção, configure assinatura Android no módulo `app` antes de gerar o APK release.

O botão HTML usa a ponte nativa quando o APK carrega a página:

```javascript
if (window.AndroidShare && typeof window.AndroidShare.share === "function") {
  window.AndroidShare.share(shareText);
}
```
