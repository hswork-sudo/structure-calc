/**
 * Kalkulator Struktur Balok Beton Bertulang
 * Berdasarkan SNI 2847:2019 (ACI 318-14)
 */

// Konstanta material
const COVER = 40; // mm - selimut beton
const STIRRUP_DIAMETER = 10; // mm - diameter sengkang

/**
 * Fungsi utama perhitungan balok
 */
function calculateBeam() {
    // Ambil input dari form
    const b = parseFloat(document.getElementById('beamWidth').value); // lebar balok (mm)
    const h = parseFloat(document.getElementById('beamHeight').value); // tinggi balok (mm)
    const L = parseFloat(document.getElementById('beamLength').value); // panjang bentang (m)
    const fc = parseFloat(document.getElementById('concreteStrength').value); // kuat tekan beton (MPa)
    const fy = parseFloat(document.getElementById('steelStrength').value); // kuat leleh baja (MPa)
    const DL = parseFloat(document.getElementById('deadLoad').value); // beban mati (kN/m)
    const LL = parseFloat(document.getElementById('liveLoad').value); // beban hidup (kN/m)
    const supportType = document.getElementById('supportType').value; // tipe perletakan

    // Validasi input
    if (!validateInput(b, h, L, fc, fy, DL, LL)) {
        return;
    }

    // Hitung berat sendiri balok
    const selfWeight = (b / 1000) * (h / 1000) * 24; // kN/m (berat jenis beton = 24 kN/m³)
    const totalDL = DL + selfWeight;

    // Hitung beban terfaktor (1.2 DL + 1.6 LL)
    const Qu = 1.2 * totalDL + 1.6 * LL;

    // Hitung momen dan geser ultimit berdasarkan tipe perletakan
    let Mu, Vu, momentCoeff;
    
    switch(supportType) {
        case 'fixed':
            momentCoeff = 12; // M = wL²/12 untuk fixed-fixed
            break;
        case 'propped':
            momentCoeff = 8; // M ≈ wL²/8 untuk propped cantilever
            break;
        case 'simply':
        default:
            momentCoeff = 8; // M = wL²/8 untuk simply supported
    }

    Mu = (Qu * Math.pow(L, 2)) / momentCoeff; // kNm
    Vu = (Qu * L) / 2; // kN (untuk simply supported)
    
    if (supportType === 'fixed') {
        Vu = (Qu * L) / 2; // sama untuk fixed
    } else if (supportType === 'propped') {
        Vu = 0.625 * Qu * L; // reaksi maksimum untuk propped
    }

    // Hitung tinggi efektif (d)
    const d = h - COVER - STIRRUP_DIAMETER - 16/2; // asumsi tulangan utama D16

    // Perhitungan tulangan lentur
    const rebarCalc = calculateFlexuralReinforcement(b, d, h, Mu, fc, fy);

    // Perhitungan tulangan geser
    const shearCalc = calculateShearReinforcement(b, d, Vu, fc, fy);

    // Tampilkan hasil
    displayResults(Qu, Mu, Vu, rebarCalc, shearCalc, fc, fy);
}

/**
 * Validasi input
 */
function validateInput(b, h, L, fc, fy, DL, LL) {
    if (b < 100 || b > 500) {
        alert('Lebar balok harus antara 100-500 mm');
        return false;
    }
    if (h < 200 || h > 800) {
        alert('Tinggi balok harus antara 200-800 mm');
        return false;
    }
    if (L < 1 || L > 10) {
        alert('Panjang bentang harus antara 1-10 m');
        return false;
    }
    if (h < b) {
        alert('Tinggi balok harus lebih besar dari lebar balok');
        return false;
    }
    return true;
}

/**
 * Perhitungan tulangan lentur
 */
function calculateFlexuralReinforcement(b, d, h, Mu, fc, fy) {
    const phi = 0.9; // faktor reduksi untuk lentur
    const Mu_Nmm = Mu * 1e6; // konversi ke Nmm

    // Hitung Rn
    const Rn = Mu_Nmm / (phi * b * Math.pow(d, 2));

    // Hitung rho perlu
    const m = fy / (0.85 * fc);
    let rho = (1 / m) * (1 - Math.sqrt(1 - (2 * m * Rn) / fy));

    // Rho minimum (SNI 2847:2019 Pasal 9.6.1.2)
    const rho_min1 = 0.25 * Math.sqrt(fc) / fy;
    const rho_min2 = 1.4 / fy;
    const rho_min = Math.max(rho_min1, rho_min2);

    // Rho maximum (SNI 2847:2019 Pasal 21.2.2.1)
    const beta1 = fc <= 28 ? 0.85 : (fc <= 56 ? 0.85 - 0.05 * (fc - 28) / 7 : 0.65);
    const rho_max = 0.85 * beta1 * (fc / fy) * (0.003 / (0.003 + 0.004)); // untuk strain 0.004

    // Kontrol rho
    if (rho < rho_min) {
        rho = rho_min;
    }
    if (rho > rho_max) {
        // Perlu tulangan rangkap atau ubah dimensi
        rho = rho_max;
    }

    // Luas tulangan tarik yang diperlukan
    const As_perlu = rho * b * d;

    // Tulangan tekan (biasanya 50% dari As untuk balok)
    const As_prime = 0.5 * As_perlu;

    // Rasio tulangan aktual
    const rho_actual = As_perlu / (b * d);

    // Opsi tulangan
    const rebarOptions = getRebarOptions(As_perlu, b);

    return {
        As: As_perlu,
        As_prime: As_prime,
        rho: rho_actual,
        rho_min: rho_min,
        rho_max: rho_max,
        options: rebarOptions,
        isOK: rho_actual <= rho_max
    };
}

/**
 * Perhitungan tulangan geser
 */
function calculateShearReinforcement(b, d, Vu, fc, fy) {
    const phi = 0.75; // faktor reduksi untuk geser
    const Vu_N = Vu * 1000; // konversi ke N

    // Kapasitas geser beton (SNI 2847:2019 Persamaan 22.5.5.1)
    const Vc = 0.17 * Math.sqrt(fc) * b * d;
    const phiVc = phi * Vc;

    // Cek apakah perlu tulangan geser
    let Vs_perlu = 0;
    let needShearRebar = false;

    if (Vu_N > phiVc) {
        needShearRebar = true;
        Vs_perlu = (Vu_N - phiVc) / phi;
    }

    // Cek kapasitas maksimum geser
    const Vs_max = 0.66 * Math.sqrt(fc) * b * d;

    // Jika perlu tulangan geser, hitung spacing
    let stirrupOptions = 'Tidak perlu sengkang (geser ditahan beton)';
    
    if (needShearRebar) {
        // Gunakan sengkang Ø10 dengan 2 kaki
        const Av = 2 * 78.5; // mm² (luas 2 batang Ø10)
        
        // Spacing teoritis
        const s_teoritis = (Av * fy * d) / Vs_perlu;
        
        // Spacing maksimum (SNI 2847:2019 Pasal 9.7.6.2.2)
        const s_max1 = d / 2;
        const s_max2 = 600;
        const s_max = Math.min(s_max1, s_max2);
        
        // Gunakan spacing yang lebih kecil
        const s_pakai = Math.min(Math.floor(s_teoritis / 10) * 10, s_max);
        
        stirrupOptions = `Ø10-${Math.round(s_pakai)} mm (2 kaki)`;
        
        // Cek apakah aman
        if (Vs_perlu > Vs_max) {
            stirrupOptions = '⚠️ Dimensi balok perlu diperbesar!';
        }
    }

    return {
        Vc: Vc,
        phiVc: phiVc,
        Vu_N: Vu_N,
        needShearRebar: needShearRebar,
        stirrupOptions: stirrupOptions,
        isOK: Vu_N <= phi * (Vc + Vs_max)
    };
}

/**
 * Dapatkan opsi tulangan
 */
function getRebarOptions(As_perlu, b) {
    const rebarSizes = [
        { diameter: 13, area: 132.7 },
        { diameter: 16, area: 201.1 },
        { diameter: 19, area: 283.5 },
        { diameter: 22, area: 380.1 },
        { diameter: 25, area: 490.9 }
    ];

    let options = [];
    
    rebarSizes.forEach(rebar => {
        const n_bars = Math.ceil(As_perlu / rebar.area);
        const As_provide = n_bars * rebar.area;
        const ratio = As_provide / As_perlu;
        
        // Cek apakah muat dalam lebar balok
        const clearCover = 40;
        const stirrupDia = 10;
        const minSpacing = 25;
        const requiredWidth = 2 * clearCover + 2 * stirrupDia + n_bars * rebar.diameter + (n_bars - 1) * minSpacing;
        
        if (requiredWidth <= b && ratio <= 1.3) { // max 30% overdesign
            options.push(`${n_bars}D${rebar.diameter} (As=${As_provide.toFixed(0)} mm²)`);
        }
    });

    if (options.length === 0) {
        // Jika tidak ada yang muat, berikan opsi terdekat
        const rebar = rebarSizes[1]; // D16 sebagai default
        const n_bars = Math.ceil(As_perlu / rebar.area);
        options.push(`${n_bars}D${rebar.diameter} (As=${n_bars * rebar.area.toFixed(0)} mm²)`);
    }

    return options.join(' | ');
}

/**
 * Tampilkan hasil perhitungan
 */
function displayResults(Qu, Mu, Vu, rebarCalc, shearCalc, fc, fy) {
    // Sembunyikan placeholder, tampilkan hasil
    document.getElementById('resultsPlaceholder').style.display = 'none';
    document.getElementById('resultsContent').style.display = 'block';

    // Beban & Momen
    document.getElementById('factoredLoad').textContent = Qu.toFixed(2) + ' kN/m';
    document.getElementById('ultimateMoment').textContent = Mu.toFixed(2) + ' kNm';
    document.getElementById('shearForce').textContent = Vu.toFixed(2) + ' kN';

    // Tulangan Lentur
    document.getElementById('tensionRebar').textContent = rebarCalc.As.toFixed(0) + ' mm²';
    document.getElementById('compressionRebar').textContent = rebarCalc.As_prime.toFixed(0) + ' mm²';
    document.getElementById('rebarRatio').textContent = 
        `${(rebarCalc.rho * 100).toFixed(3)}% (min: ${(rebarCalc.rho_min * 100).toFixed(3)}%, max: ${(rebarCalc.rho_max * 100).toFixed(3)}%)`;
    document.getElementById('rebarOptions').textContent = rebarCalc.options;

    // Tulangan Geser
    document.getElementById('concreteShear').textContent = (shearCalc.phiVc / 1000).toFixed(2) + ' kN';
    document.getElementById('shearRebarNeeded').textContent = 
        shearCalc.needShearRebar ? 'Ya' : 'Tidak';
    document.getElementById('stirrupOptions').textContent = shearCalc.stirrupOptions;

    // Status
    const strengthStatus = document.getElementById('strengthStatus');
    const ductilityStatus = document.getElementById('ductilityStatus');

    if (rebarCalc.isOK && shearCalc.isOK) {
        strengthStatus.textContent = '✅ AMAN';
        strengthStatus.className = 'value status ok';
    } else {
        strengthStatus.textContent = '⚠️ PERLU REVISI';
        strengthStatus.className = 'value status warning';
    }

    if (rebarCalc.rho <= rebarCalc.rho_max && rebarCalc.rho >= rebarCalc.rho_min) {
        ductilityStatus.textContent = '✅ DUCTILE';
        ductilityStatus.className = 'value status ok';
    } else {
        ductilityStatus.textContent = '⚠️ NON-DUCTILE';
        ductilityStatus.className = 'value status warning';
    }

    // Scroll ke hasil
    document.querySelector('.results-section').scrollIntoView({ behavior: 'smooth' });
}

// Event listener untuk Enter key
document.addEventListener('DOMContentLoaded', function() {
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                calculateBeam();
            }
        });
    });
});
