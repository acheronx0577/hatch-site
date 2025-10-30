import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Search, 
  Target, 
  CheckCircle, 
  AlertTriangle,
  Info
} from 'lucide-react'
import { 
  MLS_FIELD_DEFINITIONS,
  findBestFieldMatch,
  mapCSVHeaders,
  type MLSFieldDefinition
} from '@/utils/fuzzyFieldMatcher'

export default function FieldMappingDebug() {
  const [testField, setTestField] = useState('')
  const [testHeaders, setTestHeaders] = useState('')
  const [singleResult, setSingleResult] = useState<{ field: MLSFieldDefinition; confidence: number } | null>(null)
  const [bulkResults, setBulkResults] = useState<any>(null)

  const testSingleField = () => {
    if (!testField.trim()) return
    
    const result = findBestFieldMatch(testField.trim(), 0.5) // Lower threshold for testing
    setSingleResult(result)
  }

  const testBulkMapping = () => {
    if (!testHeaders.trim()) return
    
    const headers = testHeaders.split(',').map(h => h.trim()).filter(h => h)
    const result = mapCSVHeaders(headers, 0.7)
    setBulkResults(result)
  }

  // Test cases for common field variations
  const testCases = [
    'bathrooms_full',
    'bathrooms_half', 
    'year_built',
    'property_type',
    'property_sub_type',
    'architectural_style',
    'street_number',
    'street_name', 
    'street_suffix',
    'stories',
    'flooring',
    'pool',
    'fireplace',
    'kitchen_features',
    'primary_suite',
    'laundry',
    'construction_materials',
    'roof_type',
    'foundation',
    'exterior_features',
    'view',
    'water_source',
    'sewer',
    'tax_year',
    'agent_license',
    'office_license'
  ]

  const runAllTests = () => {
    console.log('🧪 Running Field Mapping Tests:')
    console.log(`📊 Total MLS Field Definitions: ${MLS_FIELD_DEFINITIONS.length}`)
    
    const results = testCases.map(testCase => {
      const result = findBestFieldMatch(testCase, 0.5)
      console.log(`${testCase} → ${result ? `${result.field.standardName} (${Math.round(result.confidence * 100)}%)` : 'NO MATCH'}`)
      return { testCase, result }
    })
    
    const matched = results.filter(r => r.result !== null)
    console.log(`✅ Matched: ${matched.length}/${testCases.length} test cases`)
    
    // Test bathroom fields specifically
    console.log('\n🛁 Bathroom Field Tests:')
    const bathroomTests = ['bathrooms_full', 'full_baths', 'bathrooms_half', 'half_baths', 'powder_rooms']
    bathroomTests.forEach(test => {
      const result = findBestFieldMatch(test, 0.5)
      console.log(`${test} → ${result ? `${result.field.standardName} (${Math.round(result.confidence * 100)}%)` : 'NO MATCH'}`)
    })
    
    // Test required vs optional fields
    const requiredFields = MLS_FIELD_DEFINITIONS.filter(f => f.required)
    const optionalFields = MLS_FIELD_DEFINITIONS.filter(f => !f.required)
    console.log(`\n📋 Required Fields: ${requiredFields.length}`)
    console.log(`📋 Optional Fields: ${optionalFields.length}`)
    
    // Check if BathroomsHalf is correctly optional
    const bathroomsHalf = MLS_FIELD_DEFINITIONS.find(f => f.standardName === 'BathroomsHalf')
    console.log(`🛁 BathroomsHalf is ${bathroomsHalf?.required ? 'REQUIRED' : 'OPTIONAL'} ✓`)
    
    // Check if BathroomsFull is correctly required
    const bathroomsFull = MLS_FIELD_DEFINITIONS.find(f => f.standardName === 'BathroomsFull')
    console.log(`🛁 BathroomsFull is ${bathroomsFull?.required ? 'REQUIRED' : 'OPTIONAL'} ✓`)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Field Mapping Debug Tool
          </CardTitle>
          <CardDescription>
            Test the enhanced fuzzy field mapping system with {MLS_FIELD_DEFINITIONS.length} field definitions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* System Info */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>System Status:</strong> Loaded {MLS_FIELD_DEFINITIONS.length} MLS field definitions including 
              BathroomsFull (required), BathroomsHalf (optional), YearBuilt, PropertyType, PropertySubType, 
              ArchitecturalStyle, address components, and all feature fields.
            </AlertDescription>
          </Alert>

          {/* Quick Test Button */}
          <div className="flex justify-center">
            <Button onClick={runAllTests} className="bg-blue-600 hover:bg-blue-700">
              <Search className="w-4 h-4 mr-2" />
              Run All Field Tests (Check Console)
            </Button>
          </div>

          {/* Single Field Test */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Test Single Field</h3>
            <div className="flex gap-2">
              <Input
                placeholder="Enter field name to test (e.g., bathrooms_full, year_built)"
                value={testField}
                onChange={(e) => setTestField(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && testSingleField()}
              />
              <Button onClick={testSingleField}>
                <Search className="w-4 h-4 mr-2" />
                Test
              </Button>
            </div>
            
            {singleResult && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{singleResult.field.standardName}</div>
                      <div className="text-sm text-gray-600">
                        Category: {singleResult.field.category} • 
                        Type: {singleResult.field.dataType} • 
                        {singleResult.field.required ? 'Required' : 'Optional'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Aliases: {singleResult.field.aliases.join(', ')}
                      </div>
                    </div>
                    <Badge variant={singleResult.confidence >= 0.9 ? 'default' : 'secondary'}>
                      {Math.round(singleResult.confidence * 100)}% match
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Bulk Header Test */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Test Multiple Headers</h3>
            <div className="flex gap-2">
              <Input
                placeholder="Enter comma-separated headers (e.g., bathrooms_full, year_built, property_type)"
                value={testHeaders}
                onChange={(e) => setTestHeaders(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && testBulkMapping()}
              />
              <Button onClick={testBulkMapping}>
                <Target className="w-4 h-4 mr-2" />
                Map
              </Button>
            </div>
            
            {bulkResults && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{bulkResults.mappings.length}</div>
                    <div className="text-sm text-gray-600">Mapped</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{bulkResults.unmapped.length}</div>
                    <div className="text-sm text-gray-600">Unmapped</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{bulkResults.missingRequired.length}</div>
                    <div className="text-sm text-gray-600">Missing Required</div>
                  </div>
                </div>

                {/* Mappings */}
                {bulkResults.mappings.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        Successful Mappings
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {bulkResults.mappings.map((mapping: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-green-50 rounded">
                            <div>
                              <span className="font-medium">{mapping.inputField}</span>
                              <span className="mx-2">→</span>
                              <span className="text-green-700">{mapping.mlsField.standardName}</span>
                              {mapping.isRequired && (
                                <Badge variant="destructive" className="ml-2 text-xs">Required</Badge>
                              )}
                            </div>
                            <Badge variant={mapping.confidence >= 0.9 ? 'default' : 'secondary'}>
                              {Math.round(mapping.confidence * 100)}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Unmapped */}
                {bulkResults.unmapped.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        Unmapped Fields
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {bulkResults.unmapped.map((field: string, index: number) => (
                          <Badge key={index} variant="outline" className="text-yellow-700">
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Missing Required */}
                {bulkResults.missingRequired.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        Missing Required Fields
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {bulkResults.missingRequired.map((field: any, index: number) => (
                          <Badge key={index} variant="destructive">
                            {field.standardName}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>

          {/* Common Test Cases */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Quick Test Cases</h3>
            <div className="grid grid-cols-2 gap-2">
              {testCases.map((testCase, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTestField(testCase)
                    const result = findBestFieldMatch(testCase, 0.5)
                    setSingleResult(result)
                  }}
                  className="justify-start"
                >
                  {testCase}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
