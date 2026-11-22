plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Même règle que pour la tablette : une seule clé de signature pour toutes les versions.
val magasin = System.getenv("KIPOINTE_KEYSTORE")
// Adresse du service, fixée à la construction : -Padresse=https://… (voir android/README.md).
val adresse = (findProperty("adresse") as String?) ?: "https://kipointe.vercel.app"
// Google Play exige un numéro de version croissant : celui du passage de la CI, sinon 1.
val numero = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "com.omniup.kipointe"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.omniup.kipointe"
        minSdk = 26            // Android 8
        targetSdk = 35
        versionCode = numero
        versionName = "1.0.$numero"
        buildConfigField("String", "ADRESSE", "\"$adresse\"")
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
    implementation("androidx.activity:activity-ktx:1.9.3")
    // Lecteur de QR code fourni par Google Play : aucune autorisation « appareil photo » à demander.
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
