# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Preserve line numbers and source file names for cleaner crash reports (highly recommended for Google Play Console crash logging)
-keepattributes SourceFile,LineNumberTable,Signature,InnerClasses,EnclosingMethod,Annotation

# Keep JavascriptInterfaces for web-to-native bridges (critical for WebView/Capacitor apps)
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep all Capacitor core and plugin classes
-keep class com.getcapacitor.** { *; }

# Keep application packages and database structures (prevents serialization/reflection issues in Firestore)
-keep class com.kelimesavasi.app.** { *; }

# Keep Firebase Auth and Firestore models intact
-keep class com.google.firebase.** { *; }

# Keep Play Services and AdMob classes
-keep class com.google.android.gms.** { *; }
-keep class com.google.android.gms.ads.** { *; }

