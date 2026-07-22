/**
 * One-shot import: Aneta Pharmaceuticals price list (8 Jun 2026) → medicines master.
 * Dedupes by case-insensitive name (active rows). Safe to re-run.
 *
 * Usage (from repo root):
 *   npx electron scripts/import-aneta-pricelist.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { app } = require('electron');
const Database = require('better-sqlite3');

const MANUFACTURER = 'Aneta Pharmaceuticals Pvt Ltd';

/** @typedef {{ name: string, generic_name: string, dosage_form: string, pack_size: string, gst_rate: number, category: string }} Item */

/** @type {Item[]} */
const ITEMS = [
  // —— ANTIBIOTIC RANGE ——
  { name: 'Amoxineta 250', generic_name: 'Amoxicillin 250 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Amoxineta 500', generic_name: 'Amoxicillin 500 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Azineta 250', generic_name: 'Azithromycin 250 mg', dosage_form: 'Tablet', pack_size: '10x1x6', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Azineta 500', generic_name: 'Azithromycin 500 mg', dosage_form: 'Tablet', pack_size: '10x1x3', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Clavolac CV 375', generic_name: 'Amoxicillin 250 mg + Clavulanate Acid 125 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Clavolac CV 625', generic_name: 'Amoxicillin 500 mg + Clavulanate Acid 125 mg', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Itratav 100Mg Capsule', generic_name: 'Itraconazole 100 mg', dosage_form: 'Capsule', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Itratav 200Mg Capsule', generic_name: 'Itraconazole 200 mg', dosage_form: 'Capsule', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Levoneta 250', generic_name: 'Levofloxacin 250 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Levoneta 500', generic_name: 'Levofloxacin 500 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Netaclox Lb Tablet', generic_name: 'Amoxycillin 250mg + Cloxacillin 250mg + Lactic Acid Bacillus 60 million Spores', dosage_form: 'Capsule', pack_size: '20x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Netalinoz 600', generic_name: 'Linezolid 600 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Netaroxim 500', generic_name: 'Cefuroxime Axetil 500 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Ofneta 200', generic_name: 'Ofloxacin 200 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Ofneta O', generic_name: 'Ofloxacin 200 mg + Ornidazole 500 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Podex 100 Tab', generic_name: 'Cefpodoxime Proxetil Dispersible 100 mg', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Podex-200', generic_name: 'Cefpodoxime Proxetil Dispersible 200 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Sefnet 100 Dt', generic_name: 'Cefixime 100 mg DT', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Sefnet 200 Dt', generic_name: 'Cefixime 200 mg DT', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Sefnet-O Tab', generic_name: 'Cefixime 200 mg + Ofloxacin 200 mg', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'Antibiotic' },
  { name: 'Sephalex 500 Tablet', generic_name: 'Cephalexin 500 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'Antibiotic' },

  // —— GENERAL TABLETS ——
  { name: 'Aceneta Cold & Flu', generic_name: 'Aceclofenac 100 mg + Paracetamol 325 mg + Cetirizine HCl 10 mg + Phenylephrine HCl 5 mg + Caffeine (Anhydrous) 25 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Aceneta SP 10', generic_name: 'Aceclofenac 100 mg + Paracetamol 325 mg + Serratiopeptidase 10 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Acexone SP 15', generic_name: 'Aceclofenac 100 mg + Paracetamol 325 mg + Serratiopeptidase 15 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Acexone TH4', generic_name: 'Aceclofenac 100 mg + Thiocolchicoside 4 mg', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'General' },
  { name: 'Acexone-MR Tab', generic_name: 'Aceclofenac 100 mg + Paracetamol 325 mg + Chlorzoxazone 250 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Acexone-P Tab', generic_name: 'Aceclofenac 100 mg + Paracetamol 325 mg', dosage_form: 'Tablet', pack_size: '15x2x10', gst_rate: 5, category: 'General' },
  { name: 'B-Cal D3 Tab', generic_name: 'Calcium Carbonate 500 mg + Vitamin D3 250 IU', dosage_form: 'Tablet', pack_size: '20x15', gst_rate: 5, category: 'General' },
  { name: 'Biastin M Tablet', generic_name: 'Bilastine 20 mg + Montelukast 10 mg', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'General' },
  { name: 'Bisaneta 10', generic_name: 'Bisacodyl 10 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Bisaneta 5', generic_name: 'Bisacodyl 5 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Cyclopas Tab', generic_name: 'Dicyclomine 10 mg + Mefenamic acid 250 mg', dosage_form: 'Tablet', pack_size: '30x10', gst_rate: 5, category: 'General' },
  { name: 'Defloneta 6', generic_name: 'Deflazacort 6 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Dexoneta-4', generic_name: 'Dexamethasone 4 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Dicycloneta P', generic_name: 'Dicyclomine 20 mg + Paracetamol 325 mg', dosage_form: 'Tablet', pack_size: '10x5x10', gst_rate: 5, category: 'General' },
  { name: 'Dygianeta', generic_name: 'Activated Dimethicone 50 mg + Magnesium Hydroxide 250 mg + Dried Aluminium Hydroxide gel 250 mg + Magnesium Aluminium Silicate Hydrate 50 mg', dosage_form: 'Chewable Tablet', pack_size: '20x15', gst_rate: 5, category: 'General' },
  { name: 'Kombiphen', generic_name: 'Ibuprofen 400 mg + Paracetamol 325 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Labneta', generic_name: 'Labetalol HCl 100 mg', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'General' },
  { name: 'Leecz 5 MG Tab', generic_name: 'Levocetirizine HCl 5 mg', dosage_form: 'Tablet', pack_size: '30x10', gst_rate: 5, category: 'General' },
  { name: 'Mecodip D3', generic_name: 'Methylcobalamin 1500 mcg + Alpha Lipoic Acid 100 mg + Pyridoxine 3 mg + Folic Acid 1.5 mg + Vitamin D3 1000 IU', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'General' },
  { name: 'Mefneta', generic_name: 'Mefenamic Acid 500 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Mefneta-P', generic_name: 'Mefenamic Acid 500 mg + Paracetamol 325 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Monata-LC Tab', generic_name: 'Levocetirizine HCl 5 mg + Montelukast 10 mg', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'General' },
  { name: 'Netacitaz', generic_name: 'Cetirizine HCl 10 mg', dosage_form: 'Tablet', pack_size: '20x5x10', gst_rate: 5, category: 'General' },
  { name: 'Netacitaz Cold', generic_name: 'Paracetamol 325 mg + Phenylephrine 5 mg + Cetirizine 5 mg', dosage_form: 'Tablet', pack_size: '6x5x10', gst_rate: 5, category: 'General' },
  { name: 'Netacox 90', generic_name: 'Etoricoxib 90 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Netacox Mr', generic_name: 'Etoricoxib 60 mg + Thiocolchicoside 4 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Netafenac Mr', generic_name: 'Diclofenac Potassium 50 mg + Paracetamol 325 mg + Chlorzoxazone 250 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Netafenac Sp', generic_name: 'Diclofenac Potassium 50 mg + Paracetamol 325 mg + Serratiopeptidase 10 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Netafer Xt', generic_name: 'Ferrous Ascorbate 100 mg + Folic Acid 1.5 mg + Zinc 22.5 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Netamol 500', generic_name: 'Paracetamol 500 mg', dosage_form: 'Tablet', pack_size: '10x5x10', gst_rate: 5, category: 'General' },
  { name: 'Netamol 650', generic_name: 'Paracetamol 650 mg', dosage_form: 'Tablet', pack_size: '10x2x15', gst_rate: 5, category: 'General' },
  { name: 'Netapentin-Nr', generic_name: 'Gabapentin 400 mg + Nortriptyline 10 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Netarexx 10', generic_name: 'Hydroxyzine Hydrochloride 10 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Netarexx 25', generic_name: 'Hydroxyzine Hydrochloride 25 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Netaset 4', generic_name: 'Ondansetron 4 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Netasulid', generic_name: 'Nimesulide 100 mg', dosage_form: 'Tablet', pack_size: '30x10', gst_rate: 5, category: 'General' },
  { name: 'Netasulid Cold & Flu', generic_name: 'Nimesulide 100 mg + Paracetamol 325 mg + Phenylephrine 5 mg + Cetirizine 5 mg + Caffeine 25 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Netasulid P', generic_name: 'Nimesulide 100 mg + Paracetamol 325 mg', dosage_form: 'Tablet', pack_size: '10x3x10', gst_rate: 5, category: 'General' },
  { name: 'Netazol 150', generic_name: 'Fluconazole 150 mg', dosage_form: 'Tablet', pack_size: '20x5x1', gst_rate: 5, category: 'General' },
  { name: 'Netazol 200', generic_name: 'Fluconazole 200 mg', dosage_form: 'Tablet', pack_size: '20x5x1', gst_rate: 5, category: 'General' },
  { name: 'Painjao Plus Tab', generic_name: 'Diclofenac 50 mg + Paracetamol 325 mg', dosage_form: 'Tablet', pack_size: '25x2x10', gst_rate: 5, category: 'General' },
  { name: 'Pantorize 40 Tab', generic_name: 'Pantoprazole 40 mg', dosage_form: 'Tablet', pack_size: '20x15', gst_rate: 5, category: 'General' },
  { name: 'Ppneta D', generic_name: 'Pantoprazole 40 mg + Domperidone 10 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Predneta 4', generic_name: 'Methylprednisolone 4 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Predneta 8', generic_name: 'Methylprednisolone 8 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Primaneta-N', generic_name: 'Norethisterone 5 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Ranineta', generic_name: 'Ranitidine HCl 150 mg', dosage_form: 'Tablet', pack_size: '20x30', gst_rate: 5, category: 'General' },
  { name: 'Ranineta D', generic_name: 'Ranitidine HCl 150 mg + Domperidone', dosage_form: 'Tablet', pack_size: '20x30', gst_rate: 5, category: 'General' },
  { name: 'Rpneta 20', generic_name: 'Rabeprazole 20 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Sardika Plus Tab', generic_name: 'Paracetamol 500 mg + Phenylephrine 5 mg + Caffeine (Anhydrous) 30 mg + Diphenhydramine 25 mg', dosage_form: 'Tablet', pack_size: '50x10', gst_rate: 5, category: 'General' },
  { name: 'Sidafil 100', generic_name: 'Sildenafil Citrate 100 mg', dosage_form: 'Tablet', pack_size: '30x1x4', gst_rate: 5, category: 'General' },
  { name: 'Telmaneta 40', generic_name: 'Telmisartan 40 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Torseneta 10', generic_name: 'Torsemide 10 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Trypneta 10', generic_name: 'Amitriptyline 10 mg', dosage_form: 'Tablet', pack_size: '20x10', gst_rate: 5, category: 'General' },
  { name: 'Udiniv 300 Tablet', generic_name: 'Ursodeoxycholic Acid 300 mg', dosage_form: 'Tablet', pack_size: '10x15', gst_rate: 5, category: 'General' },
  { name: 'Udneta', generic_name: 'Ursodeoxycholic Acid 300 mg', dosage_form: 'Tablet', pack_size: '10x1x10', gst_rate: 5, category: 'General' },
  { name: 'Vertineta 16', generic_name: 'Betahistine HCl 16 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },
  { name: 'Vertineta 8', generic_name: 'Betahistine HCl 8 mg', dosage_form: 'Tablet', pack_size: '10x10', gst_rate: 5, category: 'General' },

  // —— CAPSULE FORMULATIONS ——
  { name: 'Cofnet Softgel Capsules', generic_name: 'Phenylephrine 5 mg + Chlorpheniramine Maleate 2 mg + Dextromethorphan Hydrobromide 10 mg', dosage_form: 'Softgel Capsule', pack_size: '30x10', gst_rate: 5, category: 'Capsule' },
  { name: 'Espineta Dsr', generic_name: 'Esomeprazole 40 mg + Domperidone 30 mg', dosage_form: 'Capsule', pack_size: '20x10', gst_rate: 5, category: 'Capsule' },
  { name: 'Omneta D Strip', generic_name: 'Omeprazole 20 mg + Domperidone 10 mg', dosage_form: 'Capsule', pack_size: '10x10', gst_rate: 5, category: 'Capsule' },
  { name: 'Omneta Strip', generic_name: 'Omeprazole 20 mg', dosage_form: 'Capsule', pack_size: '20x10', gst_rate: 5, category: 'Capsule' },
  { name: 'P2 Biotech Capsules', generic_name: 'Bacillus clausii 2 billion + Bifidobacterium longum 1 billion + Lactobacillus rhamnosus 1 billion + Lactobacillus acidophilus 500 million + Bifidobacterium lactis 275 million + Saccharomyces boulardii 30 million + FOS 100 mg + Zinc 5 mg', dosage_form: 'Capsule', pack_size: '10x10', gst_rate: 5, category: 'Capsule' },
  { name: 'Pantorize Dsr', generic_name: 'Pantoprazole 40 mg + Domperidone 30 mg SR', dosage_form: 'Capsule', pack_size: '20x15', gst_rate: 5, category: 'Capsule' },
  { name: 'Preganeta M', generic_name: 'Pregabalin 75 mg + Methylcobalamin 750 mcg', dosage_form: 'Capsule', pack_size: '10x1x10', gst_rate: 5, category: 'Capsule' },
  { name: 'Preganeta N', generic_name: 'Pregabalin 75 mg + Methylcobalamin 1500 mcg + Nortriptyline 10 mg', dosage_form: 'Capsule', pack_size: '10x10', gst_rate: 5, category: 'Capsule' },
  { name: 'Rabidee DSR', generic_name: 'Rabeprazole 20 mg + Domperidone 30 mg SR', dosage_form: 'Capsule', pack_size: '20x10', gst_rate: 5, category: 'Capsule' },
  { name: 'Rabidee LSR', generic_name: 'Rabeprazole 20 mg + Levosulpiride 75 mg SR', dosage_form: 'Capsule', pack_size: '10x1x10', gst_rate: 5, category: 'Capsule' },

  // —— SOAP ——
  { name: 'Head Clean Soap', generic_name: 'Permethrin 5%', dosage_form: 'Soap', pack_size: '75GM', gst_rate: 18, category: 'Soap' },
  { name: 'Kzo-Clean Soap 75Gm', generic_name: 'Ketoconazole and Cetrimide Medicated Soap', dosage_form: 'Soap', pack_size: '75GM', gst_rate: 5, category: 'Soap' },

  // —— DROPS ——
  { name: 'Visibliss Eye Drops', generic_name: 'Carboxymethyl Cellulose 1%', dosage_form: 'Eye Drop', pack_size: '10 ML', gst_rate: 5, category: 'Drops' },

  // —— SYRUP / DRY SYRUP ——
  { name: 'Alkoneta', generic_name: 'Disodium Hydrogen Citrate 1.4g / 5ml', dosage_form: 'Syrup', pack_size: '100 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Amoxineta Cv Dry Syrup', generic_name: 'Amoxycillin 200 mg + Clavulanic Acid 28.5 mg', dosage_form: 'Dry Syrup', pack_size: '30 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Calneta-D3 Nano Shot', generic_name: 'Cholecalciferol (Vitamin D3) 60000 IU', dosage_form: 'Oral Solution', pack_size: '4x5ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Clearston B6 Oral Solution', generic_name: 'Potassium Citrate 1100 mg + Magnesium Citrate 375 mg + Vitamin B6 20 mg', dosage_form: 'Oral Solution', pack_size: '200ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Cofnet D', generic_name: 'Dextromethorphan Hydrobromide 15 mg + Phenylephrine HCl 5 mg + Chlorpheniramine Maleate 2 mg', dosage_form: 'Syrup', pack_size: '100 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Cofnet Ls', generic_name: 'Levosalbutamol 1 mg + Ambroxol HCl 30 mg + Guaiphenesin 50 mg', dosage_form: 'Syrup', pack_size: '100 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Cofnet M 100ml', generic_name: 'Ambroxol HCl 15 mg + Terbutaline Sulphate 1.25 mg + Guaiphenesin 50 mg + Menthol 2.5 mg', dosage_form: 'Syrup', pack_size: '100 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Cofnet M 60ml', generic_name: 'Ambroxol HCl 15 mg + Terbutaline Sulphate 1.25 mg + Guaiphenesin 50 mg + Menthol 2.5 mg', dosage_form: 'Syrup', pack_size: '60 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Cremoneta', generic_name: 'Liquid Paraffin 1.25 ml + Milk of Magnesia 3.75 ml + Sodium Picosulphate 3.33 mg', dosage_form: 'Suspension', pack_size: '170 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Dygermina Suspension', generic_name: 'Bacillus Clausii (2 Billion Spores)', dosage_form: 'Suspension', pack_size: '10x5ML', gst_rate: 5, category: 'Syrup' },
  { name: 'Dygineta Mps', generic_name: 'Dried Aluminium Hydroxide 250mg + Simethicone 50mg + Magnesium Hydroxide 250mg', dosage_form: 'Suspension', pack_size: '170 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Kofneta Br', generic_name: 'Terbutaline 1.25 mg + Bromhexine 4 mg + Guaiphenesin 50 mg + Menthol 2.5 mg', dosage_form: 'Syrup', pack_size: '100 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Kofneta Br Junior', generic_name: 'Terbutaline 1.25 mg + Bromhexine 4 mg + Guaiphenesin 50 mg + Menthol 2.5 mg', dosage_form: 'Syrup', pack_size: '60 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Mefneta - P Suspension', generic_name: 'Mefenamic Acid 100 mg + Paracetamol 250 mg', dosage_form: 'Suspension', pack_size: '60ML', gst_rate: 5, category: 'Syrup' },
  { name: 'Netacaine', generic_name: 'Oxetacaine 10mg + Aluminium Hydroxide 291 mg + Magnesium 98 mg + Simethicone 25mg', dosage_form: 'Syrup', pack_size: '170 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Netacof Ls Junior', generic_name: 'Levosalbutamol 1 mg + Ambroxol HCl 30 mg + Guaiphenesin 50 mg', dosage_form: 'Syrup', pack_size: '60 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Netadex Dx Junior', generic_name: 'Dextromethorphan Hydrobromide 15 mg + Phenylephrine HCl 5 mg + Chlorpheniramine Maleate 2 mg', dosage_form: 'Syrup', pack_size: '60 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Netlactine Syrup', generic_name: 'Cyproheptadine 2 mg + Tricholine Citrate 275 mg', dosage_form: 'Syrup', pack_size: '200 ml', gst_rate: 5, category: 'Syrup' },
  { name: 'Oflexia - M Suspension', generic_name: 'Ofloxacin 50 mg + Metronidazole 120 mg + Simethicone 10 mg', dosage_form: 'Suspension', pack_size: '60ML', gst_rate: 5, category: 'Syrup' },

  // —— NUTRINEX ——
  { name: 'A Max Z Syrup', generic_name: 'Multivitamin + Minerals + L-Lysine syrup', dosage_form: 'Syrup', pack_size: '200 ml', gst_rate: 5, category: 'Nutrinex' },
  { name: 'Apzyme Syrup', generic_name: 'Fungal Diastase 50 mg + Pepsin 10 mg', dosage_form: 'Syrup', pack_size: '200 ml', gst_rate: 5, category: 'Nutrinex' },
  { name: 'Feronet XT', generic_name: 'Ferrous Ascorbate Eq to Elemental Iron 50 mg + Folic Acid 750 mcg + Zinc 10 mg + Vit B12 7.5 mcg', dosage_form: 'Syrup', pack_size: '200 ml', gst_rate: 5, category: 'Nutrinex' },
  { name: 'Livneta', generic_name: 'Liver Tonic', dosage_form: 'Syrup', pack_size: '200 ml', gst_rate: 5, category: 'Nutrinex' },
  { name: 'Livnetazyme', generic_name: 'Liver and Digestive Tonic', dosage_form: 'Syrup', pack_size: '200 ml', gst_rate: 5, category: 'Nutrinex' },
  { name: 'Netacal K27', generic_name: 'Calcium Carbonate 500 Mg + Vitamin K2-7 45 Mcg + Calcitriol 0.25 Mcg + Hydroxocobalamin 1500 Mcg + Boron + Zinc + Magnesium', dosage_form: 'Softgel Capsule', pack_size: '10x1x10', gst_rate: 5, category: 'Nutrinex' },
  { name: 'Calneta-D3 60K', generic_name: 'Cholecalciferol 60,000 IU', dosage_form: 'Softgel Capsule', pack_size: '10x1x4', gst_rate: 5, category: 'Nutrinex' },
  { name: 'Vineta-E', generic_name: 'Omega-3 Fatty Acid, Vitamin E & Wheat Germ Oil', dosage_form: 'Softgel Capsule', pack_size: '10x1x10', gst_rate: 5, category: 'Nutrinex' },
  { name: 'Vineta-GS', generic_name: 'Ginseng + Multivitamins + Minerals Softgel', dosage_form: 'Softgel Capsule', pack_size: '10x1x10', gst_rate: 5, category: 'Nutrinex' },

  // —— OINTMENT ——
  { name: 'Becloneta', generic_name: 'Clotrimazole 1% w/w + Beclomethasone Dipropionate 0.025% w/w', dosage_form: 'Cream', pack_size: '30 g', gst_rate: 5, category: 'Ointment' },
  { name: 'Clobeneta MN', generic_name: 'Clobetasol Propionate 0.05% + Miconazole Nitrate 2% + Neomycin 0.5%', dosage_form: 'Cream', pack_size: '10 g', gst_rate: 5, category: 'Ointment' },
  { name: 'Fusineta', generic_name: 'Fusidic Acid 2% w/w', dosage_form: 'Cream', pack_size: '10 g', gst_rate: 5, category: 'Ointment' },
  { name: 'Ligneta 2% Jelly', generic_name: 'Lignocaine HCl 2% Gel', dosage_form: 'Gel', pack_size: '30 g', gst_rate: 5, category: 'Ointment' },
  { name: 'Luneta (1%)', generic_name: 'Luliconazole 1% w/w', dosage_form: 'Cream', pack_size: '30 g', gst_rate: 5, category: 'Ointment' },
  { name: 'Mupineta (2%)', generic_name: 'Mupirocin 2% w/w', dosage_form: 'Cream', pack_size: '10 g', gst_rate: 5, category: 'Ointment' },
  { name: 'Mucosore', generic_name: 'Choline Salicylate 8.7% + Lignocaine HCl 2% + Benzalkonium Chloride 0.01%', dosage_form: 'Gel', pack_size: '10 g', gst_rate: 5, category: 'Ointment' },

  // —— WELLNEX ——
  { name: 'Ba & Baby Baby Body Wash', generic_name: 'Baby Body Wash', dosage_form: 'Liquid', pack_size: '100ml', gst_rate: 18, category: 'Wellnex' },
  { name: 'Ba & Baby Baby Moisturiser', generic_name: 'Baby Moisturiser', dosage_form: 'Cream', pack_size: '100ml', gst_rate: 18, category: 'Wellnex' },
  { name: 'Ba & Baby Baby Shampoo', generic_name: 'Baby Shampoo', dosage_form: 'Liquid', pack_size: '100ml', gst_rate: 18, category: 'Wellnex' },
  { name: 'Ba & Baby Diaper Rash Cream', generic_name: 'Diaper Rash Cream', dosage_form: 'Cream', pack_size: '30ml', gst_rate: 18, category: 'Wellnex' },
  { name: 'Burneta', generic_name: 'Chlorhexidine Gluconate 0.20% + Silver Nitrate 0.20%', dosage_form: 'Cream', pack_size: '25 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Germineta', generic_name: 'Chloroxylenol, Terpineol & Alcohol (Denatured) Antiseptic Liquid', dosage_form: 'Liquid', pack_size: '100 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Kandineta', generic_name: 'Clotrimazole 1% Dusting Powder', dosage_form: 'Powder', pack_size: '100 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Koolklin-100', generic_name: 'Chlorhexidine Gluconate & Cetrimide Solution', dosage_form: 'Solution', pack_size: '100 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Koolklin-1000', generic_name: 'Chlorhexidine Gluconate & Cetrimide Solution', dosage_form: 'Solution', pack_size: '1000 ml', gst_rate: 5, category: 'Wellnex' },
  { name: "L'Raya Organic Rose Water", generic_name: 'Organic Rose Water', dosage_form: 'Liquid', pack_size: '100ml', gst_rate: 18, category: 'Wellnex' },
  { name: 'Minoxineta 5%', generic_name: 'Minoxidil 5% w/v', dosage_form: 'Solution', pack_size: '60ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Minoxineta-5F', generic_name: 'Minoxidil 5% w/v + Finasteride 0.1% w/v', dosage_form: 'Solution', pack_size: '60ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Moonex Spray', generic_name: 'Lidocaine 7.5 mg + Prilocaine 2.5 mg', dosage_form: 'Spray', pack_size: '20gm', gst_rate: 5, category: 'Wellnex' },
  { name: 'Moonex Tab', generic_name: 'Dapoxetine HCl 30 mg + Sildenafil Citrate 50 mg', dosage_form: 'Tablet', pack_size: '30x1x4', gst_rate: 5, category: 'Wellnex' },
  { name: 'Moonex-3 Chocolate', generic_name: 'Premium Quality Dotted Condom + Benzocaine 4.5% (Chocolate Flavour)', dosage_form: 'Condom', pack_size: '48x1x3', gst_rate: 0, category: 'Wellnex' },
  { name: 'Moonex-3 Strawberry', generic_name: 'Premium Quality Dotted Condom + Benzocaine 4.5% (Strawberry Flavour)', dosage_form: 'Condom', pack_size: '48x1x3', gst_rate: 0, category: 'Wellnex' },
  { name: 'Neta Oil', generic_name: 'Wintergreen Oil 8% + Cinnamon Oil 4% + Peppermint Oil 4% + other herbal oils', dosage_form: 'Oil', pack_size: '50 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Neta Spray Maxx (2%)', generic_name: 'Diclofenac Diethylamine 2.32% eq to Diclofenac sodium 2% + Methyl Salicylate 10% + Menthol 5%', dosage_form: 'Spray', pack_size: '55 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netabalm (Yellow)', generic_name: 'Amrutanjan Type Yellow Colour Balm', dosage_form: 'Balm', pack_size: '10 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netabalm Double Power (Red)', generic_name: 'Tiger Type Red Colour Balm', dosage_form: 'Balm', pack_size: '20 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netabalm Strong (White)', generic_name: 'Zandu Type White Colour Balm', dosage_form: 'Balm', pack_size: '10 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netadine 10%', generic_name: 'Povidone Iodine Ointment 10% w/w', dosage_form: 'Ointment', pack_size: '30 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netadine 5%', generic_name: 'Povidone Iodine Ointment 5% w/w', dosage_form: 'Ointment', pack_size: '10 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netadine Gargle (2%)', generic_name: 'Povidone Iodine IP 2% Gargle', dosage_form: 'Gargle', pack_size: '100 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netadine Powder (2%)', generic_name: 'Povidone Iodine IP 2% Powder', dosage_form: 'Powder', pack_size: '10 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netadine Solution (10%)', generic_name: 'Povidone Iodine IP 10% W/V Solution', dosage_form: 'Solution', pack_size: '100 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netadine Solution (5%)', generic_name: 'Povidone Iodine IP 5% W/V Solution', dosage_form: 'Solution', pack_size: '100 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netafresh Gargle', generic_name: 'Chlorhexidine Gluconate 0.2% + Menthol 0.1% + Chlorbutol 0.1%', dosage_form: 'Gargle', pack_size: '100 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netafresh Gargle MD', generic_name: 'Chlorhexidine Gluconate 0.2% + Sodium Fluoride 0.05% + Zinc Chloride 0.09%', dosage_form: 'Gargle', pack_size: '150 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netagel Advance', generic_name: 'Diclofenac Diethylamine 1.16% + Linseed Oil 3% + Methyl Salicylate 10% + Menthol 5% + Benzyl Alcohol', dosage_form: 'Gel', pack_size: '30 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netagel Rom 5X', generic_name: 'Diclofenac Diethylamine 1.16% eq to Diclofenac Sodium 1% + Linseed Oil 3% + Methyl Salicylate 10%', dosage_form: 'Cream', pack_size: '75gm', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netakrak', generic_name: 'Urea 10% + Lactic Acid 10% + Propylene Glycol + Liquid Paraffin 10%', dosage_form: 'Cream', pack_size: '25 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'NetamosQ', generic_name: 'Mosquito Repellent Cream', dosage_form: 'Cream', pack_size: '30 g', gst_rate: 18, category: 'Wellnex' },
  { name: 'Netashine', generic_name: 'Mometasone 0.1% + Hydroquinone 2% + Tretinoin 0.025%', dosage_form: 'Cream', pack_size: '15 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netaskab', generic_name: 'Gamma Benzene 0.1% + Cetrimide 0.1% Lotion', dosage_form: 'Lotion', pack_size: '100 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netasporyn Ointment', generic_name: 'Neomycin Sulphate 3400 Units + Bacitracin Zinc 400 Units + Polymyxin B Sulphate 5000 Units', dosage_form: 'Ointment', pack_size: '15g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netasporyn Powder', generic_name: 'Neomycin Sulphate 3400 Units + Bacitracin Zinc 400 Units + Polymyxin B Sulphate 5000 Units', dosage_form: 'Powder', pack_size: '10 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netaspray (1%)', generic_name: 'Diclofenac Diethylamine 1.16% + Virgin Linseed Oil 3% + Methyl Salicylate 10%', dosage_form: 'Spray', pack_size: '55 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netawash', generic_name: 'Intimate Wash', dosage_form: 'Liquid', pack_size: '100 ml', gst_rate: 18, category: 'Wellnex' },
  { name: 'Netawax', generic_name: 'Paradichlorobenzene 2% + Benzocaine 2.7% + Turpentine Oil 15% + Chlorbutol 5%', dosage_form: 'Ear Drop', pack_size: '10 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netriwin', generic_name: 'Xylometazoline HCl 0.1% (Paediatric Nasal Spray)', dosage_form: 'Nasal Spray', pack_size: '10 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Netriwin - Oxy', generic_name: 'Oxymetazoline HCl 0.05% (Adult Nasal Spray)', dosage_form: 'Nasal Spray', pack_size: '10 ml', gst_rate: 5, category: 'Wellnex' },
  { name: 'Nip Lip Cream', generic_name: 'Lip Cream', dosage_form: 'Cream', pack_size: '20 g', gst_rate: 18, category: 'Wellnex' },
  { name: 'Pileneta', generic_name: 'Calcium Dobesilate 0.25% + Lignocaine 3% + Hydrocortisone Acetate 0.25% + Zinc 5%', dosage_form: 'Cream', pack_size: '30 g', gst_rate: 5, category: 'Wellnex' },
  { name: 'Preganeta Advance', generic_name: 'Advance Pregnancy Detection Kit', dosage_form: 'Kit', pack_size: '1 Kit', gst_rate: 5, category: 'Wellnex' },
];

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  // Standalone `npx electron script` uses app name "Electron"; point at the
  // real packaged / Forge app database instead.
  const dbPath = path.join(
    process.env.APPDATA || '',
    'PillOpsDesk',
    'pharmacy.db'
  );
  console.log('DB:', dbPath);
  console.log('Price-list items:', ITEMS.length);

  const fs = require('fs');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}`);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const existing = db
    .prepare('SELECT id, name FROM medicines WHERE is_active = 1')
    .all();
  const byNorm = new Map();
  for (const row of existing) {
    byNorm.set(normalizeName(row.name), row);
  }

  const insert = db.prepare(`
    INSERT INTO medicines
      (name, generic_name, manufacturer, hsn_code, gst_rate, dosage_form, category,
       pack_size, schedule, storage_type, rack, reorder_level, is_active)
    VALUES
      (@name, @generic_name, @manufacturer, '30049099', @gst_rate, @dosage_form, @category,
       @pack_size, NULL, NULL, NULL, 10, 1)
  `);

  const skipped = [];
  const inserted = [];

  const tx = db.transaction(() => {
    for (const item of ITEMS) {
      const key = normalizeName(item.name);
      const hit = byNorm.get(key);
      if (hit) {
        skipped.push({ name: item.name, existingId: hit.id, existingName: hit.name });
        continue;
      }
      const info = insert.run({
        name: item.name.trim(),
        generic_name: item.generic_name,
        manufacturer: MANUFACTURER,
        gst_rate: item.gst_rate,
        dosage_form: item.dosage_form,
        category: item.category,
        pack_size: item.pack_size,
      });
      const id = Number(info.lastInsertRowid);
      byNorm.set(key, { id, name: item.name });
      inserted.push({ id, name: item.name });
    }
  });

  tx();
  db.close();

  console.log(JSON.stringify({
    totalInList: ITEMS.length,
    alreadyInMaster: skipped.length,
    newlyAdded: inserted.length,
    skippedNames: skipped.map((s) => s.name),
    addedNames: inserted.map((a) => a.name),
  }, null, 2));

  app.quit();
}

app.whenReady().then(() => main()).catch((err) => {
  console.error(err);
  app.exit(1);
});
