# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class ai.knownext.mobile.* {
  native <methods>;
}

-keep class ai.knownext.mobile.WryActivity {
  public <init>(...);

  void setWebView(ai.knownext.mobile.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class ai.knownext.mobile.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class ai.knownext.mobile.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class ai.knownext.mobile.RustWebChromeClient,ai.knownext.mobile.RustWebViewClient {
  public <init>(...);
}
