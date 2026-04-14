import type { PlaceDirectoryArea, PlaceDirectoryRegion } from "./place-directory";
import { buildPublicPlaceRegionSlug } from "./site";

type SubregionConfig = {
  label: string;
  areaNames: string[];
};

export interface PlaceSubregion {
  scopeId: string;
  label: string;
  regionName: string;
  publicPlaceCount: number;
  supportedAsylum: number;
  supportedAsylumRate: number | null;
  contingencyAccommodation: number;
  hotelSignalValue: number;
  hotelSignalLabel: string;
  namedCurrentSiteCount: number;
  unnamedSiteCount: number;
  leadArea: PlaceDirectoryArea | null;
  areaCodes: string[];
  areaNames: string[];
}

const REGION_SUBREGION_GROUPS: Record<string, SubregionConfig[]> = {
  "North West": [
    {
      label: "Cumbria",
      areaNames: ["Cumberland", "Westmorland and Furness"]
    },
    {
      label: "Lancashire",
      areaNames: [
        "Blackburn with Darwen",
        "Blackpool",
        "Burnley",
        "Pendle",
        "Preston",
        "Hyndburn",
        "West Lancashire",
        "South Ribble",
        "Wyre",
        "Lancaster",
        "Rossendale",
        "Chorley"
      ]
    },
    {
      label: "Greater Manchester",
      areaNames: ["Manchester", "Wigan", "Bolton", "Stockport", "Oldham", "Rochdale", "Salford", "Tameside", "Trafford", "Bury"]
    },
    {
      label: "Merseyside",
      areaNames: ["Liverpool", "Wirral", "St Helens", "Sefton", "Knowsley"]
    },
    {
      label: "Cheshire corridor",
      areaNames: ["Cheshire West and Chester", "Cheshire East", "Warrington", "Halton"]
    }
  ],
  London: [
    {
      label: "West London",
      areaNames: ["Hillingdon", "Hounslow", "Ealing", "Harrow", "Brent", "Hammersmith and Fulham", "Kensington and Chelsea"]
    },
    {
      label: "North London",
      areaNames: ["Barnet", "Enfield", "Camden", "Islington"]
    },
    {
      label: "East London",
      areaNames: ["Newham", "Redbridge", "Tower Hamlets", "Barking and Dagenham", "Hackney"]
    },
    {
      label: "South London",
      areaNames: ["Croydon", "Southwark", "Lambeth", "Merton", "Lewisham", "Greenwich", "Wandsworth"]
    }
  ],
  "West Midlands": [
    {
      label: "West Midlands core",
      areaNames: ["Birmingham", "Coventry", "Sandwell", "Wolverhampton", "Dudley", "Walsall", "Solihull"]
    },
    {
      label: "Staffordshire edge",
      areaNames: ["Stoke-on-Trent", "Telford and Wrekin", "Tamworth"]
    },
    {
      label: "Warwickshire belt",
      areaNames: ["Rugby", "Warwick", "Nuneaton and Bedworth"]
    }
  ],
  "Yorkshire and The Humber": [
    {
      label: "West Yorkshire",
      areaNames: ["Leeds", "Bradford", "Kirklees", "Wakefield", "Calderdale"]
    },
    {
      label: "South Yorkshire",
      areaNames: ["Sheffield", "Doncaster", "Rotherham", "Barnsley"]
    },
    {
      label: "Humber",
      areaNames: ["Kingston upon Hull, City of", "North East Lincolnshire"]
    },
    {
      label: "North Yorkshire",
      areaNames: ["North Yorkshire", "York"]
    }
  ],
  "East Midlands": [
    {
      label: "Nottinghamshire",
      areaNames: ["Nottingham", "Mansfield"]
    },
    {
      label: "Leicestershire",
      areaNames: ["Leicester", "Charnwood"]
    },
    {
      label: "Derbyshire",
      areaNames: ["Derby"]
    },
    {
      label: "Northamptonshire",
      areaNames: ["North Northamptonshire", "West Northamptonshire"]
    },
    {
      label: "Lincolnshire",
      areaNames: ["South Kesteven"]
    }
  ],
  "South East": [
    {
      label: "Thames Valley",
      areaNames: ["Reading", "Milton Keynes", "Slough", "Windsor and Maidenhead", "Wokingham", "Buckinghamshire", "Oxford", "Spelthorne"]
    },
    {
      label: "South Coast",
      areaNames: ["Portsmouth", "Southampton"]
    },
    {
      label: "Sussex and Surrey",
      areaNames: ["Mid Sussex", "Crawley", "Reigate and Banstead"]
    },
    {
      label: "Kent",
      areaNames: ["Medway", "Canterbury"]
    }
  ],
  "North East": [
    {
      label: "Tyne and Wear",
      areaNames: ["Newcastle upon Tyne", "Sunderland", "Gateshead", "South Tyneside", "North Tyneside"]
    },
    {
      label: "Tees Valley",
      areaNames: ["Stockton-on-Tees", "Middlesbrough", "Hartlepool", "Redcar and Cleveland", "Darlington"]
    },
    {
      label: "Northumberland and Durham",
      areaNames: ["Northumberland", "County Durham"]
    }
  ],
  "East of England": [
    {
      label: "Essex",
      areaNames: ["Braintree", "Chelmsford", "Basildon", "Colchester", "Southend-on-Sea", "Epping Forest"]
    },
    {
      label: "Hertfordshire",
      areaNames: ["Dacorum", "Broxbourne", "Stevenage"]
    },
    {
      label: "Beds and Luton",
      areaNames: ["Luton", "Bedford", "Central Bedfordshire"]
    },
    {
      label: "East Anglia",
      areaNames: ["Norwich", "Peterborough"]
    }
  ],
  Scotland: [
    {
      label: "Glasgow and west",
      areaNames: ["Glasgow City"]
    },
    {
      label: "North east",
      areaNames: ["Aberdeen City", "Aberdeenshire"]
    },
    {
      label: "Edinburgh and east",
      areaNames: ["City of Edinburgh", "Perth and Kinross"]
    }
  ],
  "South West": [
    {
      label: "West of England",
      areaNames: ["Bristol, City of", "Gloucester", "Swindon", "Wiltshire"]
    },
    {
      label: "Devon",
      areaNames: ["Plymouth", "East Devon"]
    },
    {
      label: "South coast",
      areaNames: ["Bournemouth, Christchurch and Poole"]
    },
    {
      label: "Somerset",
      areaNames: ["Somerset"]
    }
  ],
  Wales: [
    {
      label: "South east Wales",
      areaNames: ["Cardiff", "Newport"]
    },
    {
      label: "South west Wales",
      areaNames: ["Swansea"]
    }
  ],
  "Northern Ireland": [
    {
      label: "Belfast metro",
      areaNames: ["Belfast", "Antrim and Newtownabbey"]
    },
    {
      label: "North west",
      areaNames: ["Derry City and Strabane"]
    }
  ]
};

function buildSubregionScopeId(regionName: string, label: string) {
  return `subregion:${buildPublicPlaceRegionSlug(regionName)}:${buildPublicPlaceRegionSlug(label)}`;
}

function formatHotelSignalLabel(namedCurrentSiteCount: number, unnamedSiteCount: number) {
  if (namedCurrentSiteCount > 0) {
    return `${namedCurrentSiteCount} named current hotel site${namedCurrentSiteCount === 1 ? "" : "s"} visible`;
  }

  if (unnamedSiteCount > 0) {
    return `${unnamedSiteCount} unnamed acknowledged hotel site${unnamedSiteCount === 1 ? "" : "s"} visible`;
  }

  return "No named current hotel site visible";
}

function buildSubregionSummary(region: PlaceDirectoryRegion, label: string, rows: PlaceDirectoryArea[]): PlaceSubregion {
  const supportedAsylum = rows.reduce((sum, row) => sum + row.area.supportedAsylum, 0);
  const contingencyAccommodation = rows.reduce((sum, row) => sum + row.area.contingencyAccommodation, 0);
  const population = rows.reduce((sum, row) => sum + row.area.population, 0);
  const namedCurrentSiteCount = rows.reduce((sum, row) => sum + row.namedCurrentSiteCount, 0);
  const unnamedSiteCount = rows.reduce((sum, row) => sum + row.unnamedSiteCount, 0);
  const hotelLinkedPlaceCount = rows.filter((row) => row.hotelSignal !== "none").length;

  return {
    scopeId: buildSubregionScopeId(region.regionName, label),
    label,
    regionName: region.regionName,
    publicPlaceCount: rows.length,
    supportedAsylum,
    supportedAsylumRate: population > 0 ? (supportedAsylum / population) * 10000 : null,
    contingencyAccommodation,
    hotelSignalValue: namedCurrentSiteCount > 0 ? 2 : hotelLinkedPlaceCount > 0 ? 1 : 0,
    hotelSignalLabel: formatHotelSignalLabel(namedCurrentSiteCount, unnamedSiteCount),
    namedCurrentSiteCount,
    unnamedSiteCount,
    leadArea: rows.reduce<PlaceDirectoryArea | null>(
      (lead, row) => (!lead || row.area.supportedAsylum > lead.area.supportedAsylum ? row : lead),
      null
    ),
    areaCodes: rows.map((row) => row.area.areaCode),
    areaNames: rows.map((row) => row.area.areaName)
  };
}

export function buildPlaceSubregions(region: PlaceDirectoryRegion): PlaceSubregion[] {
  const config = REGION_SUBREGION_GROUPS[region.regionName];

  if (!config || config.length === 0) {
    return [];
  }

  const rowByAreaName = new Map(region.areas.map((row) => [row.area.areaName, row] as const));
  const usedAreaCodes = new Set<string>();
  const subregions: PlaceSubregion[] = [];

  for (const group of config) {
    const rows = group.areaNames
      .map((areaName) => rowByAreaName.get(areaName) ?? null)
      .filter((row): row is PlaceDirectoryArea => Boolean(row));

    if (rows.length === 0) {
      continue;
    }

    rows.forEach((row) => usedAreaCodes.add(row.area.areaCode));
    subregions.push(buildSubregionSummary(region, group.label, rows));
  }

  const uncategorizedRows = region.areas.filter((row) => !usedAreaCodes.has(row.area.areaCode));

  if (uncategorizedRows.length > 0) {
    subregions.push(buildSubregionSummary(region, `Rest of ${region.regionName}`, uncategorizedRows));
  }

  return subregions;
}
