plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.omniup.pointage"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.omniup.pointage"
        minSdk = 30            // Android 11 minimum (brief §12.9)
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        // URL de la PWA et code administrateur par défaut : surchargeables par intent extras au provisionnement.
        buildConfigField("String", "URL_PWA", "\"https://kipointe.vercel.app/kiosque\"")
        buildConfigField("String", "CODE_ADMIN_DEFAUT", "\"000000\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.activity:activity-ktx:1.9.3")

    // CameraX en ImageAnalysis continu + ML Kit Barcode Scanning (annexe §12.5)
    val camerax = "1.4.1"
    implementation("androidx.camera:camera-core:$camerax")
    implementation("androidx.camera:camera-camera2:$camerax")
    implementation("androidx.camera:camera-lifecycle:$camerax")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
}
