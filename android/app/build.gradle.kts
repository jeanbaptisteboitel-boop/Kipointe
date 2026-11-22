plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Signature : la même clé doit servir à toutes les versions, sinon Android refuse la mise à jour.
// Fournie par l'environnement (CI ou poste) ; sans elle, seul l'APK de débogage est produit.
val magasin = System.getenv("KIPOINTE_KEYSTORE")

android {
    namespace = "com.omniup.pointage"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.omniup.pointage"
        minSdk = 28            // Android 9
        targetSdk = 35
        versionCode = 3
        versionName = "2.1.0"
        // Adresse proposée au premier lancement ; modifiable sur la tablette.
        buildConfigField("String", "ADRESSE_DEFAUT", "\"https://kipointe.vercel.app\"")
    }

    signingConfigs {
        if (magasin != null) {
            create("release") {
                storeFile = file(magasin)
                storePassword = System.getenv("KIPOINTE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KIPOINTE_KEY_ALIAS")
                keyPassword = System.getenv("KIPOINTE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (magasin != null) signingConfig = signingConfigs.getByName("release")
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
}
